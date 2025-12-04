-- Phase 2 Features Migration: Email Scheduling, Smart Notifications, Analytics
-- Author: GitHub Copilot
-- Date: 2024-12-04

BEGIN;

-- Email Scheduling System
CREATE TABLE email_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
    send_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Smart Notifications System  
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
    priority_threshold INTEGER DEFAULT 3 CHECK (priority_threshold BETWEEN 1 AND 5),
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',
    quiet_hours_timezone TEXT DEFAULT 'UTC',
    weekend_notifications BOOLEAN DEFAULT false,
    keyword_alerts TEXT[], -- Array of keywords that trigger high priority
    sender_priorities JSONB DEFAULT '{}', -- Sender email -> priority mapping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('new_email', 'high_priority', 'keyword_alert', 'scheduled_reminder', 'follow_up')),
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 5 = highest
    title TEXT NOT NULL,
    content TEXT,
    read BOOLEAN DEFAULT false,
    dismissed BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Analytics System
CREATE TABLE email_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,
    recipient_email TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    subject TEXT,
    response_time_hours NUMERIC, -- Hours between sent and reply
    engagement_score NUMERIC DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE daily_email_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    emails_sent INTEGER DEFAULT 0,
    emails_received INTEGER DEFAULT 0,
    emails_replied INTEGER DEFAULT 0,
    emails_read INTEGER DEFAULT 0,
    avg_response_time_hours NUMERIC,
    top_senders JSONB DEFAULT '[]', -- Array of {email, count}
    top_subjects JSONB DEFAULT '[]', -- Array of {subject, count}
    engagement_score NUMERIC DEFAULT 0,
    productivity_score NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, stat_date)
);

-- Add analytics columns to existing messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 3 CHECK (priority_score BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS optimal_send_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_time_hours NUMERIC,
ADD COLUMN IF NOT EXISTS analytics_processed BOOLEAN DEFAULT false;

-- Performance Indexes
CREATE INDEX idx_email_schedules_user_scheduled ON email_schedules(user_id, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_email_schedules_status_time ON email_schedules(status, scheduled_for);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX idx_notifications_priority_time ON notifications(priority DESC, sent_at DESC);
CREATE INDEX idx_email_analytics_user_sent ON email_analytics(user_id, sent_at DESC);
CREATE INDEX idx_email_analytics_engagement ON email_analytics(engagement_score DESC);
CREATE INDEX idx_daily_stats_user_date ON daily_email_stats(user_id, stat_date DESC);
CREATE INDEX idx_messages_priority_score ON messages(user_id, priority_score DESC) WHERE priority_score >= 4;

-- Analytics Functions
CREATE OR REPLACE FUNCTION calculate_engagement_score(
    p_opened BOOLEAN,
    p_replied BOOLEAN, 
    p_clicked BOOLEAN,
    p_response_time_hours NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    RETURN CASE 
        WHEN p_replied THEN 
            GREATEST(8, 10 - COALESCE(p_response_time_hours / 24, 0)) -- Quick replies get higher scores
        WHEN p_clicked THEN 6
        WHEN p_opened THEN 4
        ELSE 1
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_daily_stats(p_user_id UUID, p_date DATE) RETURNS VOID AS $$
BEGIN
    INSERT INTO daily_email_stats (user_id, stat_date, emails_sent, emails_received, emails_replied, emails_read, avg_response_time_hours)
    SELECT 
        p_user_id,
        p_date,
        COUNT(*) FILTER (WHERE platform = 'gmail' AND sender LIKE '%' || (SELECT email FROM users WHERE id = p_user_id) || '%'),
        COUNT(*) FILTER (WHERE platform = 'gmail' AND sender NOT LIKE '%' || (SELECT email FROM users WHERE id = p_user_id) || '%'),
        COUNT(*) FILTER (WHERE actioned = true AND action_type = 'reply'),
        COUNT(*) FILTER (WHERE read_status = true),
        AVG(response_time_hours) FILTER (WHERE response_time_hours IS NOT NULL)
    FROM messages 
    WHERE user_id = p_user_id AND DATE(received_at) = p_date
    ON CONFLICT (user_id, stat_date) DO UPDATE SET
        emails_sent = EXCLUDED.emails_sent,
        emails_received = EXCLUDED.emails_received,
        emails_replied = EXCLUDED.emails_replied,
        emails_read = EXCLUDED.emails_read,
        avg_response_time_hours = EXCLUDED.avg_response_time_hours,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Notification trigger function
CREATE OR REPLACE FUNCTION create_smart_notification() RETURNS TRIGGER AS $$
DECLARE
    user_prefs notification_preferences%ROWTYPE;
    notification_priority INTEGER := 3;
    notification_type TEXT := 'new_email';
BEGIN
    -- Get user notification preferences
    SELECT * INTO user_prefs FROM notification_preferences WHERE user_id = NEW.user_id;
    
    -- Skip if user doesn't want notifications
    IF user_prefs IS NULL OR (NOT user_prefs.email_notifications AND NOT user_prefs.push_notifications) THEN
        RETURN NEW;
    END IF;
    
    -- Calculate priority based on sender, keywords, etc.
    notification_priority := COALESCE(NEW.priority_score, 3);
    
    -- Check if during quiet hours
    IF EXTRACT(hour FROM NOW()) BETWEEN EXTRACT(hour FROM user_prefs.quiet_hours_start) 
       AND EXTRACT(hour FROM user_prefs.quiet_hours_end) THEN
        -- Only send high priority notifications during quiet hours
        IF notification_priority < 4 THEN
            RETURN NEW;
        END IF;
    END IF;
    
    -- Check weekend preferences
    IF EXTRACT(dow FROM NOW()) IN (0, 6) AND NOT user_prefs.weekend_notifications THEN
        IF notification_priority < 4 THEN
            RETURN NEW;
        END IF;
    END IF;
    
    -- Create notification if priority meets threshold
    IF notification_priority >= user_prefs.priority_threshold THEN
        INSERT INTO notifications (user_id, message_id, type, priority, title, content)
        VALUES (
            NEW.user_id,
            NEW.id,
            CASE 
                WHEN notification_priority >= 4 THEN 'high_priority'
                ELSE notification_type
            END,
            notification_priority,
            'New Email: ' || COALESCE(NEW.subject, 'No Subject'),
            'From: ' || COALESCE(NEW.sender, 'Unknown') || 
            CASE WHEN LENGTH(NEW.body_preview) > 100 
                 THEN '\n' || LEFT(NEW.body_preview, 100) || '...'
                 ELSE '\n' || COALESCE(NEW.body_preview, '')
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for smart notifications
DROP TRIGGER IF EXISTS smart_notification_trigger ON messages;
CREATE TRIGGER smart_notification_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION create_smart_notification();

-- Insert default notification preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM users 
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- Comments for documentation
COMMENT ON TABLE email_schedules IS 'Stores scheduled emails with send timing and status tracking';
COMMENT ON TABLE notification_preferences IS 'User preferences for smart notification system';
COMMENT ON TABLE notifications IS 'Smart notifications generated based on email priority and user preferences';
COMMENT ON TABLE email_analytics IS 'Tracks email engagement metrics and response patterns';
COMMENT ON TABLE daily_email_stats IS 'Aggregated daily statistics for productivity insights';
