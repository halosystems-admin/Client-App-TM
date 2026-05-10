-- 1. Scribe Templates Table
CREATE TABLE scribe_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practice_id UUID NOT NULL,
    firebase_template_id TEXT,
    name TEXT NOT NULL,
    specialty TEXT,
    is_default BOOLEAN DEFAULT false,
    output_format TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Scribe Style Prompts Table
CREATE TABLE scribe_style_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    version INTEGER,
    system_prompt_md TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID, 
    is_active BOOLEAN DEFAULT true
);

-- 3. Scribe System Fields Table
CREATE TABLE scribe_system_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    key TEXT NOT NULL,
    display_label TEXT,
    date_format TEXT,
    source TEXT,
    default_value TEXT,
    field_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Scribe Conditional Fields Table
CREATE TABLE scribe_conditional_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    key TEXT NOT NULL,
    display_label TEXT,
    source_table TEXT,
    source_column TEXT,
    condition TEXT,
    field_order INTEGER,
    required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Scribe Vocabularies Table
CREATE TABLE scribe_vocabularies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    category TEXT NOT NULL,
    terms JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Scribe Style Examples Table
CREATE TABLE scribe_style_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    example_input_md TEXT NOT NULL,
    example_output_md TEXT NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    active BOOLEAN DEFAULT true
);

-- 7. Scribe Template Uploads Table
CREATE TABLE scribe_template_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    practice_id UUID,
    upload_type TEXT,
    drive_file_id TEXT,
    filename TEXT,
    extraction_status TEXT,
    extracted_schema_json JSONB,
    patient_data_stripped BOOLEAN DEFAULT false,
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Scribe Output Configs Table
CREATE TABLE scribe_output_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES scribe_templates(id),
    output_type TEXT NOT NULL,
    pdf_template_drive_id TEXT,
    pdf_field_mappings_json JSONB,
    letterhead_drive_id TEXT,
    docx_template_drive_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Scribe Outputs Table
CREATE TABLE scribe_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID,
    template_id UUID REFERENCES scribe_templates(id),
    practice_id UUID,
    patient_id UUID,
    system_fields_json JSONB,
    conditional_fields_json JSONB,
    raw_markdown TEXT NOT NULL,
    final_markdown TEXT,
    doctor_edited BOOLEAN DEFAULT false,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost_usd NUMERIC,
    latency_ms INTEGER,
    drive_file_id TEXT,
    pdf_filled_drive_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);