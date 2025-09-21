export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      crates: {
        Row: {
          created_at: string | null
          id: string
          name: string
          records: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          records?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          records?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          discogs_access_secret: string | null
          discogs_access_token: string | null
          discogs_avatar_url: string | null
          discogs_request_secret: string | null
          discogs_request_token: string | null
          discogs_uid: string | null
          discogs_username: string | null
          id: string
          just_completed_discogs_oauth: boolean | null
          key_format: string
          list_layout: string
          name: string | null
          selected_crate: string
          turntable_pitch_range: number
          turntable_theme: string
          ui_theme: Database["public"]["Enums"]["ui_theme_enum"]
        }
        Insert: {
          discogs_access_secret?: string | null
          discogs_access_token?: string | null
          discogs_avatar_url?: string | null
          discogs_request_secret?: string | null
          discogs_request_token?: string | null
          discogs_uid?: string | null
          discogs_username?: string | null
          id: string
          just_completed_discogs_oauth?: boolean | null
          key_format?: string
          list_layout?: string
          name?: string | null
          selected_crate?: string
          turntable_pitch_range?: number
          turntable_theme?: string
          ui_theme?: Database["public"]["Enums"]["ui_theme_enum"]
        }
        Update: {
          discogs_access_secret?: string | null
          discogs_access_token?: string | null
          discogs_avatar_url?: string | null
          discogs_request_secret?: string | null
          discogs_request_token?: string | null
          discogs_uid?: string | null
          discogs_username?: string | null
          id?: string
          just_completed_discogs_oauth?: boolean | null
          key_format?: string
          list_layout?: string
          name?: string | null
          selected_crate?: string
          turntable_pitch_range?: number
          turntable_theme?: string
          ui_theme?: Database["public"]["Enums"]["ui_theme_enum"]
        }
        Relationships: []
      }
      records: {
        Row: {
          artists: Json
          cover: string | null
          created_at: string | null
          discogs_id: number | null
          discogs_release_url: string | null
          id: string
          labels: Json
          title: string
          updated_at: string | null
          user_id: string
          year: number | null
        }
        Insert: {
          artists?: Json
          cover?: string | null
          created_at?: string | null
          discogs_id?: number | null
          discogs_release_url?: string | null
          id?: string
          labels?: Json
          title: string
          updated_at?: string | null
          user_id: string
          year?: number | null
        }
        Update: {
          artists?: Json
          cover?: string | null
          created_at?: string | null
          discogs_id?: number | null
          discogs_release_url?: string | null
          id?: string
          labels?: Json
          title?: string
          updated_at?: string | null
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          played_tracks: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          played_tracks?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          played_tracks?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          artists: Json
          beatport_data: Json | null
          bpm: number | null
          created_at: string | null
          duration: number | null
          extraartists: Json
          genres: Json
          id: string
          key: number | null
          mode: number | null
          playable: boolean | null
          position: string | null
          record_id: string
          rpm: number | null
          time_signature_lower: number | null
          time_signature_upper: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          artists?: Json
          beatport_data?: Json | null
          bpm?: number | null
          created_at?: string | null
          duration?: number | null
          extraartists?: Json
          genres?: Json
          id?: string
          key?: number | null
          mode?: number | null
          playable?: boolean | null
          position?: string | null
          record_id: string
          rpm?: number | null
          time_signature_lower?: number | null
          time_signature_upper?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          artists?: Json
          beatport_data?: Json | null
          bpm?: number | null
          created_at?: string | null
          duration?: number | null
          extraartists?: Json
          genres?: Json
          id?: string
          key?: number | null
          mode?: number | null
          playable?: boolean | null
          position?: string | null
          record_id?: string
          rpm?: number | null
          time_signature_lower?: number | null
          time_signature_upper?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      import_record_with_tracks: {
        Args: { record: Json; tracks?: Json }
        Returns: Json
      }
    }
    Enums: {
      ui_theme_enum: "light" | "dark"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ui_theme_enum: ["light", "dark"],
    },
  },
} as const

