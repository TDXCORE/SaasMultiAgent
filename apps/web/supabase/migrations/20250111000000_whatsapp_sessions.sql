-- Create WhatsApp sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20),
  session_status VARCHAR(20) DEFAULT 'disconnected' NOT NULL,
  qr_code TEXT,
  connected_at TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  messages_sent INTEGER DEFAULT 0 NOT NULL,
  messages_received INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT valid_session_status CHECK (
    session_status IN ('disconnected', 'connecting', 'waiting_qr', 'connected', 'error')
  ),
  
  -- Unique constraint: one session per user
  UNIQUE(user_id)
);

-- Create index for faster queries
CREATE INDEX idx_whatsapp_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(session_status);
CREATE INDEX idx_whatsapp_sessions_updated_at ON whatsapp_sessions(updated_at);

-- Enable Row Level Security
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own WhatsApp sessions"
ON whatsapp_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WhatsApp sessions"
ON whatsapp_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WhatsApp sessions"
ON whatsapp_sessions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WhatsApp sessions"
ON whatsapp_sessions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_sessions_updated_at();

-- Add comment for documentation
COMMENT ON TABLE whatsapp_sessions IS 'Stores WhatsApp Web session information for each user';
COMMENT ON COLUMN whatsapp_sessions.session_status IS 'Current status of the WhatsApp connection';
COMMENT ON COLUMN whatsapp_sessions.qr_code IS 'Base64 encoded QR code for authentication';
COMMENT ON COLUMN whatsapp_sessions.messages_sent IS 'Total messages sent through this session';
COMMENT ON COLUMN whatsapp_sessions.messages_received IS 'Total messages received through this session';