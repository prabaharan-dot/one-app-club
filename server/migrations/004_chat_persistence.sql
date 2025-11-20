-- Migration 004: Chat Message Persistence
-- Creates tables for storing chat sessions and messages with immediate sync

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'New Chat',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_role VARCHAR(20) NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'chat_response',
  metadata JSONB DEFAULT '{}',
  context_relevant BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_context ON chat_messages(session_id, context_relevant, created_at ASC) WHERE context_relevant = TRUE;

-- Function to update session updated_at when messages are added
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions 
  SET updated_at = NOW() 
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update session timestamp
DROP TRIGGER IF EXISTS trigger_update_chat_session_timestamp ON chat_messages;
CREATE TRIGGER trigger_update_chat_session_timestamp
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_timestamp();

-- Add sample initial message function
CREATE OR REPLACE FUNCTION create_initial_chat_message(p_session_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  message_id UUID;
BEGIN
  INSERT INTO chat_messages (session_id, user_id, message_role, content, message_type, context_relevant)
  VALUES (p_session_id, p_user_id, 'assistant', 'Hi! I''m your assistant. How can I help today?', 'chat_response', FALSE)
  RETURNING id INTO message_id;
  
  RETURN message_id;
END;
$$ LANGUAGE plpgsql;
