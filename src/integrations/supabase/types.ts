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
      billing_invoice_items: {
        Row: {
          amount: number
          id: string
          invoice_id: string
          label: string
          metadata: Json
          quantity: number
          unit_amount: number
        }
        Insert: {
          amount?: number
          id?: string
          invoice_id: string
          label: string
          metadata?: Json
          quantity?: number
          unit_amount?: number
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string
          label?: string
          metadata?: Json
          quantity?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          due_date: string | null
          formula_snapshot: Json
          id: string
          invoice_number: string
          paid_at: string | null
          purchase_count: number
          status: string
          subtotal: number
          tenant_id: string
          total: number
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          due_date?: string | null
          formula_snapshot?: Json
          id?: string
          invoice_number: string
          paid_at?: string | null
          purchase_count?: number
          status?: string
          subtotal?: number
          tenant_id: string
          total?: number
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          due_date?: string | null
          formula_snapshot?: Json
          id?: string
          invoice_number?: string
          paid_at?: string | null
          purchase_count?: number
          status?: string
          subtotal?: number
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          device_limit: number
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          speed_limit: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          device_limit?: number
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          speed_limit?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          device_limit?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          speed_limit?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          provider_event_id: string | null
          provider_id: string
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          provider_event_id?: string | null
          provider_id: string
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          provider_event_id?: string | null
          provider_id?: string
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          created_at: string
          display_name: string
          flow_type: string
          id: string
          is_active: boolean
          metadata: Json
          supported_currencies: string[]
        }
        Insert: {
          created_at?: string
          display_name: string
          flow_type?: string
          id: string
          is_active?: boolean
          metadata?: Json
          supported_currencies?: string[]
        }
        Update: {
          created_at?: string
          display_name?: string
          flow_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          supported_currencies?: string[]
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          customer_email: string | null
          customer_phone: string | null
          expires_at: string | null
          gateway_id: string | null
          id: string
          internal_reference: string
          metadata: Json
          package_id: string | null
          paid_at: string | null
          provider_checkout_id: string | null
          provider_id: string
          provider_reference: string | null
          status: string
          tenant_id: string
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          gateway_id?: string | null
          id?: string
          internal_reference: string
          metadata?: Json
          package_id?: string | null
          paid_at?: string | null
          provider_checkout_id?: string | null
          provider_id: string
          provider_reference?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          gateway_id?: string | null
          id?: string
          internal_reference?: string
          metadata?: Json
          package_id?: string | null
          paid_at?: string | null
          provider_checkout_id?: string | null
          provider_id?: string
          provider_reference?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "tenant_payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
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
      radreply: {
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
      router_provisioning_jobs: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          payload: Json
          requested_by: string | null
          result: Json
          router_id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type: string
          payload?: Json
          requested_by?: string | null
          result?: Json
          router_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          payload?: Json
          requested_by?: string | null
          result?: Json
          router_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_provisioning_jobs_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "router_provisioning_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      routers: {
        Row: {
          created_at: string
          encrypted_secret: string | null
          host: string | null
          id: string
          last_error: string | null
          last_seen_at: string | null
          metadata: Json
          name: string
          provisioning_status: string
          site_name: string | null
          ssh_port: number | null
          tenant_id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          encrypted_secret?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          metadata?: Json
          name: string
          provisioning_status?: string
          site_name?: string | null
          ssh_port?: number | null
          tenant_id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          encrypted_secret?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          metadata?: Json
          name?: string
          provisioning_status?: string
          site_name?: string | null
          ssh_port?: number | null
          tenant_id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_gateways: {
        Row: {
          config: Json
          created_at: string
          display_name: string | null
          id: string
          provider_id: string
          public_config: Json
          status: string
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name?: string | null
          id?: string
          provider_id: string
          public_config?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string | null
          id?: string
          provider_id?: string
          public_config?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_gateways_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_payment_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          billing_status: Database["public"]["Enums"]["tenant_billing_status"]
          created_at: string
          currency_code: string
          id: string
          monthly_base_fee: number
          name: string
          per_purchase_fee: number
          portal_subtitle: string | null
          portal_title: string | null
          primary_color: string | null
          slug: string
          status: string
          support_email: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          billing_status?: Database["public"]["Enums"]["tenant_billing_status"]
          created_at?: string
          currency_code?: string
          id?: string
          monthly_base_fee?: number
          name: string
          per_purchase_fee?: number
          portal_subtitle?: string | null
          portal_title?: string | null
          primary_color?: string | null
          slug: string
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          billing_status?: Database["public"]["Enums"]["tenant_billing_status"]
          created_at?: string
          currency_code?: string
          id?: string
          monthly_base_fee?: number
          name?: string
          per_purchase_fee?: number
          portal_subtitle?: string | null
          portal_title?: string | null
          primary_color?: string | null
          slug?: string
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
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
          activated_at: string | null
          checkout_request_id: string | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          mac_address: string | null
          mpesa_receipt: string | null
          package_id: string
          phone_number: string
          session_timeout: number | null
          status: string
          tenant_id: string | null
          used_at: string | null
        }
        Insert: {
          activated_at?: string | null
          checkout_request_id?: string | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mac_address?: string | null
          mpesa_receipt?: string | null
          package_id: string
          phone_number: string
          session_timeout?: number | null
          status?: string
          tenant_id?: string | null
          used_at?: string | null
        }
        Update: {
          activated_at?: string | null
          checkout_request_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mac_address?: string | null
          mpesa_receipt?: string | null
          package_id?: string
          phone_number?: string
          session_timeout?: number | null
          status?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      is_tenant_manager_role: {
        Args: {
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_member: {
        Args: {
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      tenant_billing_status: "active" | "watch" | "suspended"
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
      tenant_billing_status: ["active", "watch", "suspended"],
    },
  },
} as const
