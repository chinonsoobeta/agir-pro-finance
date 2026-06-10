
CREATE TYPE public.assumption_status AS ENUM ('pending','approved','modified','rejected','needs_review','missing');
CREATE TYPE public.confidence_band AS ENUM ('high','medium','low','missing');
CREATE TYPE public.ic_decision AS ENUM ('approve','approve_with_conditions','reject');
CREATE TYPE public.risk_severity AS ENUM ('info','yellow','red','critical');

CREATE TABLE public.assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  value_numeric NUMERIC,
  value_text TEXT,
  status public.assumption_status NOT NULL DEFAULT 'pending',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  confidence_band public.confidence_band NOT NULL DEFAULT 'missing',
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  source_location TEXT,
  source_text TEXT,
  ai_reasoning TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  impact_rank INTEGER,
  impact_amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, field_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumptions TO authenticated;
GRANT ALL ON public.assumptions TO service_role;
ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage assumptions" ON public.assumptions FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_assumptions_project ON public.assumptions(project_id);

CREATE TABLE public.assumption_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_id UUID NOT NULL REFERENCES public.assumptions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  status public.assumption_status NOT NULL,
  confidence_score INTEGER,
  confidence_band public.confidence_band,
  source_document_id UUID,
  source_text TEXT,
  changed_by UUID NOT NULL,
  changed_by_name TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumption_versions TO authenticated;
GRANT ALL ON public.assumption_versions TO service_role;
ALTER TABLE public.assumption_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage versions" ON public.assumption_versions FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_versions_assumption ON public.assumption_versions(assumption_id);

CREATE TABLE public.assumption_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_id UUID NOT NULL REFERENCES public.assumptions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumption_comments TO authenticated;
GRANT ALL ON public.assumption_comments TO service_role;
ALTER TABLE public.assumption_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage comments" ON public.assumption_comments FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.financial_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  scenario_key TEXT NOT NULL DEFAULT 'base',
  metric_key TEXT NOT NULL,
  metric_label TEXT,
  value_numeric NUMERIC,
  unit TEXT,
  formula_text TEXT,
  inputs JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, scenario_key, metric_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_outputs TO authenticated;
GRANT ALL ON public.financial_outputs TO service_role;
ALTER TABLE public.financial_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage outputs" ON public.financial_outputs FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_outputs_project ON public.financial_outputs(project_id);

CREATE TABLE public.risk_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  risk_type TEXT NOT NULL,
  severity public.risk_severity NOT NULL DEFAULT 'yellow',
  title TEXT NOT NULL,
  description TEXT,
  related_assumption_id UUID REFERENCES public.assumptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_register TO authenticated;
GRANT ALL ON public.risk_register TO service_role;
ALTER TABLE public.risk_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage risks" ON public.risk_register FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.decision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT,
  decision public.ic_decision NOT NULL,
  rationale TEXT,
  conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_logs TO authenticated;
GRANT ALL ON public.decision_logs TO service_role;
ALTER TABLE public.decision_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage decisions" ON public.decision_logs FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read audit" ON public.audit_logs FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "owners insert audit" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_audit_project ON public.audit_logs(project_id, created_at DESC);

CREATE TRIGGER trg_assumptions_updated BEFORE UPDATE ON public.assumptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
