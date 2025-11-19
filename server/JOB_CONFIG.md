# Job Configuration Environment Variables

# Gmail Polling Job
GOOGLE_POLL_INTERVAL=300000          # Gmail polling interval in ms (5 minutes)

# LLM Processing Job  
LLM_PROCESSING_INTERVAL=60000        # LLM processing interval in ms (1 minute)
LLM_MAX_RETRIES=3                    # Maximum retry attempts for failed messages
LLM_RETRY_DELAY_HOURS=1              # Hours to wait before retrying failed messages

# Example .env addition:
# GOOGLE_POLL_INTERVAL=300000
# LLM_PROCESSING_INTERVAL=60000
# LLM_MAX_RETRIES=3
# LLM_RETRY_DELAY_HOURS=1
