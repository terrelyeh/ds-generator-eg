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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      change_logs: {
        Row: {
          changes_detail: Json | null
          changes_summary: string
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          notified: boolean
          product_id: string | null
          product_line_id: string | null
        }
        Insert: {
          changes_detail?: Json | null
          changes_summary?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          notified?: boolean
          product_id?: string | null
          product_line_id?: string | null
        }
        Update: {
          changes_detail?: Json | null
          changes_summary?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          notified?: boolean
          product_id?: string | null
          product_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_logs_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          message_count: number
          messages: Json
          persona: string
          provider: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_count?: number
          messages?: Json
          persona?: string
          provider?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_count?: number
          messages?: Json
          persona?: string
          provider?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cloud_comparisons: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          model_name: string
          product_line_id: string | null
          sort_order: number | null
          specs: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          model_name: string
          product_line_id?: string | null
          sort_order?: number | null
          specs?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          model_name?: string
          product_line_id?: string | null
          sort_order?: number | null
          specs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cloud_comparisons_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      comparisons: {
        Row: {
          category: string
          created_at: string | null
          id: string
          label: string
          model_name: string
          product_line_id: string | null
          sort_order: number | null
          value: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          label: string
          model_name: string
          product_line_id?: string | null
          sort_order?: number | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          label?: string
          model_name?: string
          product_line_id?: string | null
          sort_order?: number | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparisons_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chunk_index: number
          content: string
          content_hash: string | null
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          source_id: string
          source_type: string
          source_url: string | null
          title: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          chunk_index?: number
          content: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id: string
          source_type: string
          source_url?: string | null
          title: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id?: string
          source_type?: string
          source_url?: string | null
          title?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      email_whitelist: {
        Row: {
          email: string
          invited_at: string
          invited_by: string | null
          note: string | null
          role: string
        }
        Insert: {
          email: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          role?: string
        }
        Update: {
          email?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_whitelist_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hardware_labels: {
        Row: {
          id: string
          position: string
          product_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          position?: string
          product_id: string
          sort_order?: number
          text: string
        }
        Update: {
          id?: string
          position?: string
          product_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "hardware_labels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      image_assets: {
        Row: {
          created_at: string
          drive_file_id: string | null
          file_url: string | null
          id: string
          image_type: Database["public"]["Enums"]["image_type"]
          label: string
          product_id: string
          status: Database["public"]["Enums"]["image_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          file_url?: string | null
          id?: string
          image_type: Database["public"]["Enums"]["image_type"]
          label?: string
          product_id: string
          status?: Database["public"]["Enums"]["image_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          file_url?: string | null
          id?: string
          image_type?: Database["public"]["Enums"]["image_type"]
          label?: string
          product_id?: string
          status?: Database["public"]["Enums"]["image_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lines: {
        Row: {
          category: string
          cloud_comparison_gid: string | null
          comparison_gid: string | null
          created_at: string
          detail_specs_gid: string | null
          drive_folder_id: string | null
          ds_images_folder_id: string | null
          ds_prefix: string | null
          id: string
          label: string
          last_synced_at: string | null
          name: string
          overview_gid: string | null
          revision_log_gid: string | null
          sheet_id: string | null
          solution: string | null
          solution_id: string
          sort_order: number | null
        }
        Insert: {
          category: string
          cloud_comparison_gid?: string | null
          comparison_gid?: string | null
          created_at?: string
          detail_specs_gid?: string | null
          drive_folder_id?: string | null
          ds_images_folder_id?: string | null
          ds_prefix?: string | null
          id?: string
          label: string
          last_synced_at?: string | null
          name: string
          overview_gid?: string | null
          revision_log_gid?: string | null
          sheet_id?: string | null
          solution?: string | null
          solution_id: string
          sort_order?: number | null
        }
        Update: {
          category?: string
          cloud_comparison_gid?: string | null
          comparison_gid?: string | null
          created_at?: string
          detail_specs_gid?: string | null
          drive_folder_id?: string | null
          ds_images_folder_id?: string | null
          ds_prefix?: string | null
          id?: string
          label?: string
          last_synced_at?: string | null
          name?: string
          overview_gid?: string | null
          revision_log_gid?: string | null
          sheet_id?: string | null
          solution?: string | null
          solution_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lines_solution_id_fkey"
            columns: ["solution_id"]
            isOneToOne: false
            referencedRelation: "solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations: {
        Row: {
          confirmed: boolean
          features: Json | null
          hardware_image: string | null
          headline: string | null
          id: string
          locale: string
          overview: string | null
          product_id: string
          qr_label: string | null
          qr_url: string | null
          subtitle: string | null
          translated_at: string | null
          translated_by: string | null
          translation_mode: string
        }
        Insert: {
          confirmed?: boolean
          features?: Json | null
          hardware_image?: string | null
          headline?: string | null
          id?: string
          locale: string
          overview?: string | null
          product_id: string
          qr_label?: string | null
          qr_url?: string | null
          subtitle?: string | null
          translated_at?: string | null
          translated_by?: string | null
          translation_mode?: string
        }
        Update: {
          confirmed?: boolean
          features?: Json | null
          hardware_image?: string | null
          headline?: string | null
          id?: string
          locale?: string
          overview?: string | null
          product_id?: string
          qr_label?: string | null
          qr_url?: string | null
          subtitle?: string | null
          translated_at?: string | null
          translated_by?: string | null
          translation_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_translations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["model_name"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          current_version: string
          current_versions: Json
          features: string[]
          full_name: string
          hardware_image: string
          headline: string
          id: string
          layout_ack: Json
          model_name: string
          overview: string
          product_image: string
          product_line_id: string
          sheet_last_editor: string | null
          sheet_last_modified: string | null
          status: string | null
          subtitle: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version?: string
          current_versions?: Json
          features?: string[]
          full_name?: string
          hardware_image?: string
          headline?: string
          id?: string
          layout_ack?: Json
          model_name: string
          overview?: string
          product_image?: string
          product_line_id: string
          sheet_last_editor?: string | null
          sheet_last_modified?: string | null
          status?: string | null
          subtitle?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version?: string
          current_versions?: Json
          features?: string[]
          full_name?: string
          hardware_image?: string
          headline?: string
          id?: string
          layout_ack?: Json
          model_name?: string
          overview?: string
          product_image?: string
          product_line_id?: string
          sheet_last_editor?: string | null
          sheet_last_modified?: string | null
          status?: string | null
          subtitle?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          last_sign_in_at: string | null
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          last_sign_in_at?: string | null
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          last_sign_in_at?: string | null
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      revision_logs: {
        Row: {
          action: string | null
          change_type: string | null
          created_at: string | null
          description: string
          editor: string | null
          id: string
          mkt_close_date: string | null
          parsed_date: string | null
          product_line_id: string | null
          revision_date: string | null
          target_page: string | null
        }
        Insert: {
          action?: string | null
          change_type?: string | null
          created_at?: string | null
          description: string
          editor?: string | null
          id?: string
          mkt_close_date?: string | null
          parsed_date?: string | null
          product_line_id?: string | null
          revision_date?: string | null
          target_page?: string | null
        }
        Update: {
          action?: string | null
          change_type?: string | null
          created_at?: string | null
          description?: string
          editor?: string | null
          id?: string
          mkt_close_date?: string | null
          parsed_date?: string | null
          product_line_id?: string | null
          revision_date?: string | null
          target_page?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_logs_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      solutions: {
        Row: {
          color_primary: string
          color_scheme: string
          created_at: string
          ds_template: string
          icon: string | null
          id: string
          label: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color_primary?: string
          color_scheme?: string
          created_at?: string
          ds_template?: string
          icon?: string | null
          id?: string
          label: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color_primary?: string
          color_scheme?: string
          created_at?: string
          ds_template?: string
          icon?: string | null
          id?: string
          label?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      spec_items: {
        Row: {
          id: string
          label: string
          section_id: string
          sort_order: number
          value: string
        }
        Insert: {
          id?: string
          label: string
          section_id: string
          sort_order?: number
          value: string
        }
        Update: {
          id?: string
          label?: string
          section_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "spec_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "spec_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      spec_label_translations: {
        Row: {
          id: string
          label_type: string
          locale: string
          original_label: string
          product_line_id: string
          translated_label: string | null
        }
        Insert: {
          id?: string
          label_type?: string
          locale: string
          original_label: string
          product_line_id: string
          translated_label?: string | null
        }
        Update: {
          id?: string
          label_type?: string
          locale?: string
          original_label?: string
          product_line_id?: string
          translated_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spec_label_translations_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      spec_sections: {
        Row: {
          category: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "spec_sections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_glossary: {
        Row: {
          created_at: string | null
          english_term: string
          id: string
          locale: string
          notes: string | null
          scope: string
          source: string
          translated_term: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          english_term: string
          id?: string
          locale: string
          notes?: string | null
          scope?: string
          source?: string
          translated_term: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          english_term?: string
          id?: string
          locale?: string
          notes?: string | null
          scope?: string
          source?: string
          translated_term?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      versions: {
        Row: {
          changes: string
          generated_at: string
          generated_by: string | null
          id: string
          locale: string
          pdf_storage_path: string | null
          product_id: string
          version: string
        }
        Insert: {
          changes?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          locale?: string
          pdf_storage_path?: string | null
          product_id: string
          version: string
        }
        Update: {
          changes?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          locale?: string
          pdf_storage_path?: string | null
          product_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_documents: {
        Args: {
          filter_metadata?: Json
          filter_source_type?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
          source_type: string
          source_url: string
          title: string
        }[]
      }
    }
    Enums: {
      image_status: "missing" | "uploaded" | "approved"
      image_type:
        | "product"
        | "hardware"
        | "radio_pattern"
        | "packaging"
        | "application"
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
      image_status: ["missing", "uploaded", "approved"],
      image_type: [
        "product",
        "hardware",
        "radio_pattern",
        "packaging",
        "application",
      ],
    },
  },
} as const
