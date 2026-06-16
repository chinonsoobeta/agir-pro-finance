
-- ============ Wipe existing engine data (kept tables in place) ============
TRUNCATE TABLE
  public.assumption_comments,
  public.assumption_history,
  public.assumption_versions,
  public.assumptions,
  public.financial_outputs,
  public.decision_logs,
  public.scenarios,
  public.risk_register,
  public.audit_logs
RESTART IDENTITY CASCADE;

-- ============ Extend assumptions for provenance ============
ALTER TABLE public.assumptions
  ADD COLUMN IF NOT EXISTS source_page_number integer,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reviewer_id uuid;

-- ============ Candidates table (Engine 2 output) ============
CREATE TABLE IF NOT EXISTS public.assumption_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  document_name text,
  page_number integer,
  source_type text,
  kind text NOT NULL,                  -- currency | percent | date | units | sf | ratio | text
  value_numeric numeric,
  value_text text,
  unit text,
  source_text text,
  source_context text,
  label_hint text,
  confidence integer NOT NULL DEFAULT 0,
  canonical_key text,
  classification_status text NOT NULL DEFAULT 'unclassified', -- unclassified | classified | ignored
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_project ON public.assumption_candidates(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_canonical ON public.assumption_candidates(project_id, canonical_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumption_candidates TO authenticated;
GRANT ALL ON public.assumption_candidates TO service_role;

ALTER TABLE public.assumption_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage candidates"
  ON public.assumption_candidates FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ============ Conflicts table (Engine 4 output) ============
CREATE TABLE IF NOT EXISTS public.assumption_conflicts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  canonical_key text NOT NULL,
  field_label text NOT NULL,
  status text NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
  candidate_ids uuid[] NOT NULL DEFAULT '{}',
  resolution_candidate_id uuid,
  resolution_value_numeric numeric,
  resolution_value_text text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_conflict_project_key
  ON public.assumption_conflicts(project_id, canonical_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumption_conflicts TO authenticated;
GRANT ALL ON public.assumption_conflicts TO service_role;

ALTER TABLE public.assumption_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage conflicts"
  ON public.assumption_conflicts FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_conflicts_updated
  BEFORE UPDATE ON public.assumption_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
