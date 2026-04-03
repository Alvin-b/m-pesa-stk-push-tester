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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      packages: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          speed_limit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          speed_limit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          speed_limit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      radacct: {
        Row: {
          acctinputoctets: number | null
          acctoutputoctets: number | null
          acctsessionid: string
          acctstarttime: string | null
          acctstoptime: string | null
          acctterminatecause: string
          acctuniqueid: string
          acctupdatetime: string | null
          calledstationid: string
          callingstationid: string
          framedipaddress: string
          nasipaddress: string
          nasportid: string | null
          nasporttype: string | null
          radacctid: number
          username: string
        }
        Insert: {
          acctinputoctets?: number | null
          acctoutputoctets?: number | null
          acctsessionid?: string
          acctstarttime?: string | null
          acctstoptime?: string | null
          acctterminatecause?: string
          acctuniqueid?: string
          acctupdatetime?: string | null
          calledstationid?: string
          callingstationid?: string
          framedipaddress?: string
          nasipaddress?: string
          nasportid?: string | null
          nasporttype?: string | null
          radacctid?: number
          username?: string
        }
        Update: {
          acctinputoctets?: number | null
          acctoutputoctets?: number | null
          acctsessionid?: string
          acctstarttime?: string | null
          acctstoptime?: string | null
          acctterminatecause?: string
          acctuniqueid?: string
          acctupdatetime?: string | null
          calledstationid?: string
          callingstationid?: string
          framedipaddress?: string
          nasipaddress?: string
          nasportid?: string | null
          nasporttype?: string | null
          radacctid?: number
          username?: string
        }
        Relationships: []
      }
      radcheck: {
        Row: {
          attribute: string
          id: number
          op: string
          username: string
          value: string
        }
        Insert: {
          attribute?: string
          id?: number
          op?: string
          username?: string
          value?: string
        }
        Update: {
          attribute?: string
          id?: number
          op?: string
          username?: string
          value?: string
        }
        Relationships: []
      }
      router_settings: {
        Row: {
          api_password: string | null
          api_port: string | null
          api_username: string | null
          created_at: string
          created_by: string | null
          dns_name: string | null
          hotspot_interface: string | null
          id: string
          radius_acct_port: number | null
          radius_auth_port: number | null
          radius_secret: string | null
          radius_server_ip: string | null
          router_ip: string | null
          router_name: string
          updated_at: string
        }
        Insert: {
          api_password?: string | null
          api_port?: string | null
          api_username?: string | null
          created_at?: string
          created_by?: string | null
          dns_name?: string | null
          hotspot_interface?: string | null
          id?: string
          radius_acct_port?: number | null
          radius_auth_port?: number | null
          radius_secret?: string | null
          radius_server_ip?: string | null
          router_ip?: string | null
          router_name?: string
          updated_at?: string
        }
        Update: {
          api_password?: string | null
          api_port?: string | null
          api_username?: string | null
          created_at?: string
          created_by?: string | null
          dns_name?: string | null
          hotspot_interface?: string | null
          id?: string
          radius_acct_port?: number | null
          radius_auth_port?: number | null
          radius_secret?: string | null
          radius_server_ip?: string | null
          router_ip?: string | null
          router_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          bytes_down: number | null
          bytes_up: number | null
          expires_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          mac_address: string | null
          started_at: string
          voucher_id: string
        }
        Insert: {
          bytes_down?: number | null
          bytes_up?: number | null
          expires_at: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          mac_address?: string | null
          started_at?: string
          voucher_id: string
        }
        Update: {
          bytes_down?: number | null
          bytes_up?: number | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          mac_address?: string | null
          started_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          checkout_request_id: string | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          mpesa_receipt: string | null
          package_id: string
          phone_number: string
          status: string
          used_at: string | null
        }
        Insert: {
          checkout_request_id?: string | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mpesa_receipt?: string | null
          package_id: string
          phone_number: string
          status?: string
          used_at?: string | null
        }
        Update: {
          checkout_request_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mpesa_receipt?: string | null
          package_id?: string
          phone_number?: string
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
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
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
