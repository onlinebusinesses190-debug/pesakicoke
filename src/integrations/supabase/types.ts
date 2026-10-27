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
      wallets: {
        Row: {
          user_id: string
          balance: number
          demo_balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          balance?: number
          demo_balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          balance?: number
          demo_balance?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          id: string
          user_id: string | null
          type: string
          mode: string
          amount: number
          description: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          type: string
          mode: string
          amount: number
          description?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          type?: string
          mode?: string
          amount?: number
          description?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["user_id"]
          }
        ]
      }
      mpesa_deposits: {
        Row: {
          id: string
          user_id: string | null
          amount: number
          phone: string | null
          checkout_request_id: string
          mpesa_receipt: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          amount: number
          phone?: string | null
          checkout_request_id: string
          mpesa_receipt?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          amount?: number
          phone?: string | null
          checkout_request_id?: string
          mpesa_receipt?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["user_id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string | null
          phone: string | null
          created_at: string
        }
        Insert: {
          id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
        }
        Relationships: []
      }
      mpesa_withdrawals: {
        Row: {
          id: string
          user_id: string
          amount: number
          phone: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          phone: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          phone?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["user_id"]
          }
        ]
      }
      referrals: {
        Row: {
          id: string
          referrer_id: string
          referred_id: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          referrer_id: string
          referred_id: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          referrer_id?: string
          referred_id?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      referral_rewards: {
        Row: {
          id: string
          referral_id: string
          amount: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          referral_id?: string
          amount?: number
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          referral_id?: string
          amount?: number
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          }
        ]
      }
      business_applications: {
        Row: {
          id: string
          user_id: string
          business_name: string
          business_type: string
          amount_requested: number
          status: string
          details: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          business_name: string
          business_type: string
          amount_requested: number
          status?: string
          details: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          business_name?: string
          business_type?: string
          amount_requested?: number
          status?: string
          details?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      business_investments: {
        Row: {
          id: string
          application_id: string
          investor_id: string
          amount: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          investor_id: string
          amount: number
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          investor_id?: string
          amount?: number
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_investments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "business_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_investments_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      success_stories: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "success_stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      // FX Trading tables
      pesaki_fx_wallets: {
        Row: {
          user_id: string
          demo_balance: number
          real_balance: number
          created_at: string
          updated_at: string
          locked: number
        }
        Insert: {
          user_id: string
          demo_balance?: number
          real_balance?: number
          created_at?: string
          updated_at?: string
          locked?: number
        }
        Update: {
          user_id?: string
          demo_balance?: number
          real_balance?: number
          created_at?: string
          updated_at?: string
          locked?: number
        }
        Relationships: [
          {
            foreignKeyName: "pesaki_fx_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      pesaki_fx_trades: {
        Row: {
          id: string
          user_id: string
          mode: "demo" | "real"
          symbol: string
          side: "buy" | "sell"
          amount: number
          margin: number
          leverage: number
          entry_price: number
          exit_price: number | null
          pnl: number | null
          status: "open" | "closed"
          close_reason: string | null
          opened_at: string
          closed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          mode: "demo" | "real"
          symbol: string
          side: "buy" | "sell"
          amount: number
          margin: number
          leverage: number
          entry_price: number
          exit_price?: number | null
          pnl?: number | null
          status?: "open" | "closed"
          close_reason?: string | null
          opened_at?: string
          closed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          mode?: "demo" | "real"
          symbol?: string
          side?: "buy" | "sell"
          amount?: number
          margin?: number
          leverage?: number
          entry_price?: number
          exit_price?: number | null
          pnl?: number | null
          status?: "open" | "closed"
          close_reason?: string | null
          opened_at?: string
          closed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesaki_fx_trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      pesaki_fx_open_trade: {
        Args: {
          _user: string
          _mode: "demo" | "real"
          _symbol: string
          _side: "buy" | "sell"
          _amount: number
          _leverage: number
          _entry: number
        }
        Returns: string
      }
      pesaki_fx_close_trade: {
        Args: {
          _user: string
          _trade: string
          _exit: number
          _pnl: number
          _reason: string
        }
        Returns: Json
      }
      debit_wallet: {
        Args: {
          p_user_id: string
          p_amount: number
          p_mode: "real" | "demo"
          p_description: string
        }
        Returns: number
      }
      credit_wallet: {
        Args: {
          p_user_id: string
          p_amount: number
          p_mode: "real" | "demo"
          p_description: string
        }
        Returns: number
      }
      transfer_wallet: {
        Args: {
          p_from_user_id: string
          p_to_user_id: string
          p_amount: number
          p_mode: "real" | "demo"
          p_description: string
        }
        Returns: number
      }
      reserve_locked_funds: {
        Args: {
          p_user_id: string
          p_amount: number
        }
        Returns: boolean
      }
      p_deposit_id: {
        Args: {
          p_checkout_request_id: string
        }
        Returns: string
      }
      process_referral_reward: {
        Args: {
          p_referral_id: string
          p_amount: number
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
