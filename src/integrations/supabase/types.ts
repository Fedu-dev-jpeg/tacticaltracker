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
      agenda_events: {
        Row: {
          created_at: string
          created_by: string
          date: string
          description: string
          event_type: string
          id: string
          teamup_event_id: string | null
          time_end: string
          time_start: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          date: string
          description?: string
          event_type?: string
          id?: string
          teamup_event_id?: string | null
          time_end?: string
          time_start?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          event_type?: string
          id?: string
          teamup_event_id?: string | null
          time_end?: string
          time_start?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string
          id: string
          teamup_api_key: string | null
          teamup_calendar_key: string | null
          teamup_last_sync: string | null
          teamup_password: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          teamup_api_key?: string | null
          teamup_calendar_key?: string | null
          teamup_last_sync?: string | null
          teamup_password?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          teamup_api_key?: string | null
          teamup_calendar_key?: string | null
          teamup_last_sync?: string | null
          teamup_password?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          confirmed: boolean
          created_at: string
          ct_finalizacion: string
          ct_pistol: string
          ct_second_round: string
          ct_setup: string
          date: string
          demo_data: Json | null
          id: string
          map: string
          notes: string
          recorded_by: string
          rival: string
          score_them: number
          score_us: number
          starting_side: string
          tr_finalizacion: string
          tr_pistol: string
          tr_second_round: string
          tr_setup: string
          type: string
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          ct_finalizacion?: string
          ct_pistol?: string
          ct_second_round?: string
          ct_setup?: string
          date?: string
          demo_data?: Json | null
          id?: string
          map: string
          notes?: string
          recorded_by?: string
          rival?: string
          score_them?: number
          score_us?: number
          starting_side?: string
          tr_finalizacion?: string
          tr_pistol?: string
          tr_second_round?: string
          tr_setup?: string
          type: string
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          ct_finalizacion?: string
          ct_pistol?: string
          ct_second_round?: string
          ct_setup?: string
          date?: string
          demo_data?: Json | null
          id?: string
          map?: string
          notes?: string
          recorded_by?: string
          rival?: string
          score_them?: number
          score_us?: number
          starting_side?: string
          tr_finalizacion?: string
          tr_pistol?: string
          tr_second_round?: string
          tr_setup?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_descriptions: {
        Row: {
          description: string
          player: string
        }
        Insert: {
          description?: string
          player: string
        }
        Update: {
          description?: string
          player?: string
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          adr: number | null
          assists: number | null
          created_at: string
          deaths: number | null
          dr: number | null
          fd: number | null
          fk: number | null
          flash_assists: number | null
          hs_pct: number | null
          id: string
          k2: number | null
          k3: number | null
          k4: number | null
          k5: number | null
          kast_pct: number | null
          kills: number | null
          kr: number | null
          match_id: string
          rating: number | null
          role: string | null
          steam_id: string | null
          steam_tag: string | null
          updated_at: string
          user_id: string | null
          util_dmg: number | null
        }
        Insert: {
          adr?: number | null
          assists?: number | null
          created_at?: string
          deaths?: number | null
          dr?: number | null
          fd?: number | null
          fk?: number | null
          flash_assists?: number | null
          hs_pct?: number | null
          id?: string
          k2?: number | null
          k3?: number | null
          k4?: number | null
          k5?: number | null
          kast_pct?: number | null
          kills?: number | null
          kr?: number | null
          match_id: string
          rating?: number | null
          role?: string | null
          steam_id?: string | null
          steam_tag?: string | null
          updated_at?: string
          user_id?: string | null
          util_dmg?: number | null
        }
        Update: {
          adr?: number | null
          assists?: number | null
          created_at?: string
          deaths?: number | null
          dr?: number | null
          fd?: number | null
          fk?: number | null
          flash_assists?: number | null
          hs_pct?: number | null
          id?: string
          k2?: number | null
          k3?: number | null
          k4?: number | null
          k5?: number | null
          kast_pct?: number | null
          kills?: number | null
          kr?: number | null
          match_id?: string
          rating?: number | null
          role?: string | null
          steam_id?: string | null
          steam_tag?: string | null
          updated_at?: string
          user_id?: string | null
          util_dmg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          book: string
          created_at: string
          description: string
          id: string
          link: string
          map: string
          name: string
          notes: string
          player_roles: Json
          side: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          book?: string
          created_at?: string
          description?: string
          id?: string
          link?: string
          map: string
          name: string
          notes?: string
          player_roles?: Json
          side: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          book?: string
          created_at?: string
          description?: string
          id?: string
          link?: string
          map?: string
          name?: string
          notes?: string
          player_roles?: Json
          side?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_coach: boolean
          player_name: string
          role_in_team: string | null
          steam_avatar_url: string | null
          steam_id: string | null
          steam_tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_coach?: boolean
          player_name: string
          role_in_team?: string | null
          steam_avatar_url?: string | null
          steam_id?: string | null
          steam_tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_coach?: boolean
          player_name?: string
          role_in_team?: string | null
          steam_avatar_url?: string | null
          steam_id?: string | null
          steam_tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_objectives: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string
          current_value: number
          id: string
          target_value: number
          title: string
          updated_at: string
          week_start: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          created_by?: string
          current_value?: number
          id?: string
          target_value?: number
          title: string
          updated_at?: string
          week_start?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string
          current_value?: number
          id?: string
          target_value?: number
          title?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      tournament_maps: {
        Row: {
          created_at: string
          id: string
          map_name: string
          played_at: string | null
          result: string | null
          score_them: number | null
          score_us: number | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          map_name: string
          played_at?: string | null
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          map_name?: string
          played_at?: string | null
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_maps_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          format: string
          id: string
          name: string
          notes: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string
          id?: string
          name: string
          notes?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      app_role: "player" | "coach" | "admin"
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
      app_role: ["player", "coach", "admin"],
    },
  },
} as const
