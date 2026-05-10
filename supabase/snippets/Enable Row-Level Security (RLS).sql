-- Enable RLS
ALTER TABLE scribe_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scribe_template_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scribe_outputs ENABLE ROW LEVEL SECURITY;

-- Apply Practice Isolation Policies
CREATE POLICY practice_isolation ON scribe_templates 
USING (practice_id = current_setting('app.practice_id')::uuid);

CREATE POLICY practice_isolation ON scribe_template_uploads 
USING (practice_id = current_setting('app.practice_id')::uuid);

CREATE POLICY practice_isolation ON scribe_outputs 
USING (practice_id = current_setting('app.practice_id')::uuid);