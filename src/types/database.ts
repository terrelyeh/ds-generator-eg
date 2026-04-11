export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ImageType =
  | "product"
  | "hardware"
  | "radio_pattern"
  | "packaging"
  | "application";

export type ImageStatus = "missing" | "uploaded" | "approved";

export type UserRole = "admin" | "pm" | "mkt" | "viewer";

export interface Database {
  public: {
    Tables: {
      solutions: {
        Row: {
          id: string;
          name: string;
          slug: string;
          label: string;
          icon: string | null;
          sort_order: number;
          color_primary: string;
          color_scheme: string;
          ds_template: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["solutions"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["solutions"]["Row"], "id" | "created_at">>;
        Update: Partial<Database["public"]["Tables"]["solutions"]["Insert"]>;
      };
      product_lines: {
        Row: {
          id: string;
          name: string;
          label: string;
          category: string;
          sheet_id: string | null;
          overview_gid: string | null;
          detail_specs_gid: string | null;
          revision_log_gid: string | null;
          comparison_gid: string | null;
          cloud_comparison_gid: string | null;
          sort_order: number;
          ds_images_folder_id: string | null;
          drive_folder_id: string | null;
          ds_prefix: string;
          solution: string;
          solution_id: string;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["product_lines"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["product_lines"]["Row"], "id" | "created_at">>;
        Update: Partial<Database["public"]["Tables"]["product_lines"]["Insert"]>;
      };
      products: {
        Row: {
          id: string;
          product_line_id: string;
          model_name: string;
          subtitle: string;
          full_name: string;
          headline: string;
          overview: string;
          features: string[];
          product_image: string;
          hardware_image: string;
          current_version: string;
          current_versions: Record<string, string>;
          status: string;
          sheet_last_modified: string | null;
          sheet_last_editor: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["products"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["products"]["Row"],
              "id" | "created_at" | "updated_at" | "subtitle" | "full_name" | "headline" | "overview" | "features" | "product_image" | "hardware_image" | "current_version" | "sheet_last_modified" | "sheet_last_editor"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      spec_sections: {
        Row: {
          id: string;
          product_id: string;
          category: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["spec_sections"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["spec_sections"]["Row"], "id" | "created_at" | "sort_order">>;
        Update: Partial<Database["public"]["Tables"]["spec_sections"]["Insert"]>;
      };
      spec_items: {
        Row: {
          id: string;
          section_id: string;
          label: string;
          value: string;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["spec_items"]["Row"], "id"> &
          Partial<Pick<Database["public"]["Tables"]["spec_items"]["Row"], "id" | "sort_order">>;
        Update: Partial<Database["public"]["Tables"]["spec_items"]["Insert"]>;
      };
      hardware_labels: {
        Row: {
          id: string;
          product_id: string;
          text: string;
          position: string;
          sort_order: number;
        };
        Insert: Omit<
          Database["public"]["Tables"]["hardware_labels"]["Row"],
          "id"
        > &
          Partial<Pick<Database["public"]["Tables"]["hardware_labels"]["Row"], "id" | "position" | "sort_order">>;
        Update: Partial<Database["public"]["Tables"]["hardware_labels"]["Insert"]>;
      };
      image_assets: {
        Row: {
          id: string;
          product_id: string;
          image_type: ImageType;
          label: string;
          file_url: string | null;
          drive_file_id: string | null;
          status: ImageStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["image_assets"]["Row"],
          "id" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["image_assets"]["Row"],
              "id" | "created_at" | "updated_at" | "label" | "file_url" | "drive_file_id" | "status"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["image_assets"]["Insert"]>;
      };
      versions: {
        Row: {
          id: string;
          product_id: string;
          version: string;
          locale: string;
          changes: string;
          pdf_storage_path: string | null;
          generated_by: string | null;
          generated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["versions"]["Row"],
          "id" | "generated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["versions"]["Row"],
              "id" | "generated_at" | "changes" | "pdf_storage_path" | "generated_by"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["versions"]["Insert"]>;
      };
      change_logs: {
        Row: {
          id: string;
          product_id: string | null;
          product_line_id: string | null;
          edited_by: string | null;
          edited_at: string | null;
          changes_summary: string;
          changes_detail: Json | null;
          notified: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["change_logs"]["Row"],
          "id" | "created_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["change_logs"]["Row"],
              "id" | "created_at" | "product_id" | "product_line_id" | "edited_by" | "edited_at" | "changes_summary" | "notified"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["change_logs"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          role: UserRole;
          product_line_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profiles"]["Row"],
          "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["profiles"]["Row"],
              "created_at" | "updated_at" | "display_name" | "role" | "product_line_ids"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      revision_logs: {
        Row: {
          id: string;
          product_line_id: string | null;
          revision_date: string | null;
          parsed_date: string | null;
          editor: string | null;
          action: string | null;
          target_page: string | null;
          change_type: string | null;
          description: string;
          mkt_close_date: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["revision_logs"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["revision_logs"]["Row"], "id" | "created_at">>;
        Update: Partial<Database["public"]["Tables"]["revision_logs"]["Insert"]>;
      };
      comparisons: {
        Row: {
          id: string;
          product_line_id: string | null;
          model_name: string;
          category: string;
          label: string;
          value: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["comparisons"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["comparisons"]["Row"], "id" | "created_at">>;
        Update: Partial<Database["public"]["Tables"]["comparisons"]["Insert"]>;
      };
      cloud_comparisons: {
        Row: {
          id: string;
          product_line_id: string | null;
          model_name: string;
          label: string | null;
          specs: Record<string, string>;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["cloud_comparisons"]["Row"],
          "id" | "created_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["cloud_comparisons"]["Row"], "id" | "created_at">>;
        Update: Partial<Database["public"]["Tables"]["cloud_comparisons"]["Insert"]>;
      };
      product_translations: {
        Row: {
          id: string;
          product_id: string;
          locale: string;
          translation_mode: "light" | "full";
          overview: string | null;
          features: string[] | null;
          confirmed: boolean;
          translated_at: string;
          translated_by: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["product_translations"]["Row"],
          "id" | "translated_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["product_translations"]["Row"], "id" | "translated_at" | "overview" | "features" | "translated_by">>;
        Update: Partial<Database["public"]["Tables"]["product_translations"]["Insert"]>;
      };
      spec_label_translations: {
        Row: {
          id: string;
          product_line_id: string;
          locale: string;
          original_label: string;
          translated_label: string | null;
          label_type: "spec" | "section";
        };
        Insert: Omit<
          Database["public"]["Tables"]["spec_label_translations"]["Row"],
          "id"
        > &
          Partial<Pick<Database["public"]["Tables"]["spec_label_translations"]["Row"], "id" | "translated_label">>;
        Update: Partial<Database["public"]["Tables"]["spec_label_translations"]["Insert"]>;
      };
    };
    Enums: {
      image_type: ImageType;
      image_status: ImageStatus;
      user_role: UserRole;
    };
  };
}

// Convenience type aliases
export type Solution = Database["public"]["Tables"]["solutions"]["Row"];
export type ProductLine = Database["public"]["Tables"]["product_lines"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type SpecSection = Database["public"]["Tables"]["spec_sections"]["Row"];
export type SpecItem = Database["public"]["Tables"]["spec_items"]["Row"];
export type HardwareLabel = Database["public"]["Tables"]["hardware_labels"]["Row"];
export type ImageAsset = Database["public"]["Tables"]["image_assets"]["Row"];
export type Version = Database["public"]["Tables"]["versions"]["Row"];
export type ChangeLog = Database["public"]["Tables"]["change_logs"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type RevisionLog = Database["public"]["Tables"]["revision_logs"]["Row"];
export type Comparison = Database["public"]["Tables"]["comparisons"]["Row"];
export type CloudComparison = Database["public"]["Tables"]["cloud_comparisons"]["Row"];
export type ProductTranslation = Database["public"]["Tables"]["product_translations"]["Row"];
export type SpecLabelTranslation = Database["public"]["Tables"]["spec_label_translations"]["Row"];

// Composite types for API responses
export type ProductWithSpecs = Product & {
  product_line: ProductLine;
  spec_sections: (SpecSection & { items: SpecItem[] })[];
  hardware_labels: HardwareLabel[];
  image_assets: ImageAsset[];
};

export type ProductSummary = Pick<
  Product,
  | "id"
  | "model_name"
  | "subtitle"
  | "full_name"
  | "current_version"
  | "product_image"
  | "sheet_last_modified"
  | "sheet_last_editor"
  | "updated_at"
> & {
  product_line: Pick<ProductLine, "name" | "label" | "category">;
  image_readiness: {
    total: number;
    ready: number;
  };
};
