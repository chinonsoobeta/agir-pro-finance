// Seed the Harbour Centre demo project: creates the project, links the 6
// pre-uploaded demo documents from storage, and runs extraction so the user
// can immediately review the resulting assumption register.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_FILES = [
  { name: "Harbour_Centre_Sponsor_Summary.pdf", category: "Sponsor", path: "demo/harbour-centre/Sponsor_Summary.pdf", size: 1696, type: "application/pdf" },
  { name: "Harbour_Centre_Market_Study.pdf", category: "Market Study", path: "demo/harbour-centre/Market_Study.pdf", size: 1733, type: "application/pdf" },
  { name: "Harbour_Centre_Broker_Opinion.pdf", category: "Appraisal", path: "demo/harbour-centre/Broker_Opinion.pdf", size: 1644, type: "application/pdf" },
  { name: "Harbour_Centre_Lender_Term_Sheet.pdf", category: "Loan Package", path: "demo/harbour-centre/Lender_Term_Sheet.pdf", size: 1789, type: "application/pdf" },
  { name: "Harbour_Centre_Construction_Budget.xlsx", category: "Budget", path: "demo/harbour-centre/Construction_Budget.xlsx", size: 4949, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { name: "Harbour_Centre_Rent_Roll.xlsx", category: "Financial Model", path: "demo/harbour-centre/Rent_Roll.xlsx", size: 4995, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
];

export const seedHarbourCentre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Create the project
    const { data: project, error } = await context.supabase.from("projects").insert({
      owner_id: context.userId,
      name: "Harbour Centre",
      location: "Mixed-use waterfront",
      type: "mixed_use",
      status: "underwriting",
      notes: "Demo deal: 220-unit residential tower over 18k SF retail and 32k SF office.",
    }).select().single();
    if (error) throw new Error(error.message);

    // Link existing storage paths as documents (no re-upload)
    for (const f of DEMO_FILES) {
      await context.supabase.from("documents").insert({
        owner_id: context.userId, project_id: project.id,
        name: f.name, category: f.category, storage_path: f.path,
        file_type: f.type, size_bytes: f.size,
      });
    }

    await context.supabase.from("activities").insert({
      project_id: project.id, user_id: context.userId,
      activity_type: "project_created",
      description: "Seeded Harbour Centre demo with 6 source documents",
    });

    return { project_id: project.id };
  });
