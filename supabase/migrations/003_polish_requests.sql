-- Create polish_requests table for tracking content polish requests to Howl.ie team
CREATE TABLE polish_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  brief_text TEXT NOT NULL,
  draft_text TEXT,
  action_title TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_polish_requests_org_id ON polish_requests(org_id);
CREATE INDEX idx_polish_requests_status ON polish_requests(status);
CREATE INDEX idx_polish_requests_project_id ON polish_requests(project_id);

-- Enable RLS
ALTER TABLE polish_requests ENABLE ROW LEVEL SECURITY;

-- RLS policy: users see only polish requests from their organisation
CREATE POLICY "Users can view their org's polish requests"
  ON polish_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS policy: users can insert polish requests for their org
CREATE POLICY "Users can create polish requests for their org"
  ON polish_requests
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );
