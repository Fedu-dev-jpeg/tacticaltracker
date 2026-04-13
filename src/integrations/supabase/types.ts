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
          time_end?: string
          time_start?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          ct_finalizacion: string
          ct_pistol: string
          ct_second_round: string
          ct_setup: string
          date: string
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
          created_at?: string
          ct_finalizacion?: string
          ct_pistol?: string
          ct_second_round?: string
          ct_setup?: string
          date?: string
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
          created_at?: string
          ct_finalizacion?: string
          ct_pistol?: string
          ct_second_round?: string
          ct_setup?: string
          date?: string
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
      strategies: {
        Row: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
