export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assumption_history: {
        Row: {
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          previous_value: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assumption_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_assumptions: string | null
          ai_risks: string | null
          ai_summary: string | null
          category: string | null
          file_type: string | null
          id: string
          name: string
          owner_id: string
          project_id: string | null
          size_bytes: number | null
          storage_path: string
          upload_date: string
        }
        Insert: {
          ai_assumptions?: string | null
          ai_risks?: string | null
          ai_summary?: string | null
          category?: string | null
          file_type?: string | null
          id?: string
          name: string
          owner_id: string
          project_id?: string | null
          size_bytes?: number | null
          storage_path: string
          upload_date?: string
        }
        Update: {
          ai_assumptions?: string | null
          ai_risks?: string | null
          ai_summary?: string | null
          category?: string | null
          file_type?: string | null
          id?: string
          name?: string
          owner_id?: string
          project_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          upload_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_memos: {
        Row: {
          content: Json
          created_at: string
          id: string
          owner_id: string
          project_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          owner_id: string
          project_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_memos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          acquisition_cost: number | null
          completion_date: string | null
          construction_cost: number | null
          created_at: string
          debt_amount: number | null
          equity_amount: number | null
          id: string
          interest_rate: number | null
          location: string | null
          name: string
          notes: string | null
          owner_id: string
          revenue_forecast: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
        }
        Insert: {
          acquisition_cost?: number | null
          completion_date?: string | null
          construction_cost?: number | null
          created_at?: string
          debt_amount?: number | null
          equity_amount?: number | null
          id?: string
          interest_rate?: number | null
          location?: string | null
          name: string
          notes?: string | null
          owner_id: string
          revenue_forecast?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Update: {
          acquisition_cost?: number | null
          completion_date?: string | null
          construction_cost?: number | null
          created_at?: string
          debt_amount?: number | null
          equity_amount?: number | null
          id?: string
          interest_rate?: number | null
          location?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          revenue_forecast?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          cost_change: number | null
          created_at: string
          exit_cap_rate: number | null
          id: string
          interest_rate_change: number | null
          name: string
          occupancy: number | null
          owner_id: string
          project_id: string
          rent_growth: number | null
          revenue_change: number | null
        }
        Insert: {
          cost_change?: number | null
          created_at?: string
          exit_cap_rate?: number | null
          id?: string
          interest_rate_change?: number | null
          name: string
          occupancy?: number | null
          owner_id: string
          project_id: string
          rent_growth?: number | null
          revenue_change?: number | null
        }
        Update: {
          cost_change?: number | null
          created_at?: string
          exit_cap_rate?: number | null
          id?: string
          interest_rate_change?: number | null
          name?: string
          occupancy?: number | null
          owner_id?: string
          project_id?: string
          rent_growth?: number | null
          revenue_change?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "analyst" | "executive"
      project_status:
        | "pipeline"
        | "underwriting"
        | "approved"
        | "active"
        | "completed"
        | "cancelled"
      project_type:
        | "multifamily"
        | "commercial"
        | "mixed_use"
        | "land"
        | "industrial"
        | "retail"
        | "office"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "analyst", "executive"],
      project_status: [
        "pipeline",
        "underwriting",
        "approved",
        "active",
        "completed",
        "cancelled",
      ],
      project_type: [
        "multifamily",
        "commercial",
        "mixed_use",
        "land",
        "industrial",
        "retail",
        "office",
        "other",
      ],
    },
  },
} as const
