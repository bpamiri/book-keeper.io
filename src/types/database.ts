// ============================================================
// BookKeeper: Database Types (matches Supabase schema)
// ============================================================

// ------------------------------------------------------------
// Enum Types
// ------------------------------------------------------------

export type UserRole = 'platform_admin' | 'user';
export type ClusterRole = 'admin' | 'collaborator';
export type MemberStatus = 'pending' | 'active';
export type BookCategory = 'main_sequence' | 'branch_book3' | 'branch_book5';
export type PublicationStatus = 'published' | 'pre_publication' | 'in_development';
export type ChangeType = 'added' | 'removed' | 'transferred' | 'adjustment' | 'fulfilled';
export type RequestStatus = 'pending' | 'approved' | 'fulfilled' | 'denied';

// ------------------------------------------------------------
// Database Type (Supabase conventions)
// ------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clusters: {
        Row: {
          id: string;
          name: string;
          region: string | null;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          region?: string | null;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          region?: string | null;
          description?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clusters_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cluster_members: {
        Row: {
          id: string;
          cluster_id: string;
          user_id: string | null;
          email: string;
          cluster_role: ClusterRole;
          status: MemberStatus;
          invited_by: string;
          invited_at: string;
          joined_at: string | null;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          user_id?: string | null;
          email: string;
          cluster_role: ClusterRole;
          status?: MemberStatus;
          invited_by: string;
          invited_at?: string;
          joined_at?: string | null;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          user_id?: string | null;
          email?: string;
          cluster_role?: ClusterRole;
          status?: MemberStatus;
          invited_by?: string;
          invited_at?: string;
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cluster_members_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cluster_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cluster_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      storage_locations: {
        Row: {
          id: string;
          cluster_id: string;
          name: string;
          address: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          notes: string | null;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          name: string;
          address?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          name?: string;
          address?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storage_locations_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_locations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ruhi_books: {
        Row: {
          id: string;
          title: string;
          book_number: number | null;
          category: BookCategory;
          publication_status: PublicationStatus;
          unit: string | null;
          language: string;
          description: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          book_number?: number | null;
          category: BookCategory;
          publication_status: PublicationStatus;
          unit?: string | null;
          language?: string;
          description?: string | null;
          is_active?: boolean;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          book_number?: number | null;
          category?: BookCategory;
          publication_status?: PublicationStatus;
          unit?: string | null;
          language?: string;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          cluster_id: string;
          storage_location_id: string;
          ruhi_book_id: string;
          quantity: number;
          notes: string | null;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          storage_location_id: string;
          ruhi_book_id: string;
          quantity?: number;
          notes?: string | null;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          storage_location_id?: string;
          ruhi_book_id?: string;
          quantity?: number;
          notes?: string | null;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_ruhi_book_id_fkey";
            columns: ["ruhi_book_id"];
            isOneToOne: false;
            referencedRelation: "ruhi_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      book_requests: {
        Row: {
          id: string;
          cluster_id: string;
          ruhi_book_id: string;
          quantity_requested: number;
          requested_by: string;
          purpose: string | null;
          status: RequestStatus;
          fulfilled_by: string | null;
          fulfilled_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          ruhi_book_id: string;
          quantity_requested: number;
          requested_by: string;
          purpose?: string | null;
          status?: RequestStatus;
          fulfilled_by?: string | null;
          fulfilled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          ruhi_book_id?: string;
          quantity_requested?: number;
          requested_by?: string;
          purpose?: string | null;
          status?: RequestStatus;
          fulfilled_by?: string | null;
          fulfilled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "book_requests_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_requests_ruhi_book_id_fkey";
            columns: ["ruhi_book_id"];
            isOneToOne: false;
            referencedRelation: "ruhi_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_requests_fulfilled_by_fkey";
            columns: ["fulfilled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      request_fulfillments: {
        Row: {
          id: string;
          request_id: string;
          storage_location_id: string;
          quantity: number;
          fulfilled_by: string;
          fulfilled_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          request_id: string;
          storage_location_id: string;
          quantity: number;
          fulfilled_by: string;
          fulfilled_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          request_id?: string;
          storage_location_id?: string;
          quantity?: number;
          fulfilled_by?: string;
          fulfilled_at?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "request_fulfillments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "book_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_fulfillments_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_fulfillments_fulfilled_by_fkey";
            columns: ["fulfilled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_log: {
        Row: {
          id: string;
          cluster_id: string;
          storage_location_id: string;
          ruhi_book_id: string;
          change_type: ChangeType;
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          related_request_id: string | null;
          related_fulfillment_id: string | null;
          notes: string | null;
          performed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cluster_id: string;
          storage_location_id: string;
          ruhi_book_id: string;
          change_type: ChangeType;
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          related_request_id?: string | null;
          related_fulfillment_id?: string | null;
          notes?: string | null;
          performed_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cluster_id?: string;
          storage_location_id?: string;
          ruhi_book_id?: string;
          change_type?: ChangeType;
          quantity_change?: number;
          previous_quantity?: number;
          new_quantity?: number;
          related_request_id?: string | null;
          related_fulfillment_id?: string | null;
          notes?: string | null;
          performed_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_log_cluster_id_fkey";
            columns: ["cluster_id"];
            isOneToOne: false;
            referencedRelation: "clusters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_log_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_log_ruhi_book_id_fkey";
            columns: ["ruhi_book_id"];
            isOneToOne: false;
            referencedRelation: "ruhi_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_log_related_request_id_fkey";
            columns: ["related_request_id"];
            isOneToOne: false;
            referencedRelation: "book_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_log_related_fulfillment_id_fkey";
            columns: ["related_fulfillment_id"];
            isOneToOne: false;
            referencedRelation: "request_fulfillments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_log_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_cluster_member: {
        Args: { p_cluster_id: string };
        Returns: boolean;
      };
      is_cluster_admin: {
        Args: { p_cluster_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      cluster_role: ClusterRole;
      member_status: MemberStatus;
      book_category: BookCategory;
      publication_status: PublicationStatus;
      change_type: ChangeType;
      request_status: RequestStatus;
    };
  };
};

// ------------------------------------------------------------
// Convenience Type Aliases
// ------------------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Row type aliases
export type Profile = Tables<'profiles'>;
export type Cluster = Tables<'clusters'>;
export type ClusterMember = Tables<'cluster_members'>;
export type StorageLocation = Tables<'storage_locations'>;
export type RuhiBook = Tables<'ruhi_books'>;
export type Inventory = Tables<'inventory'>;
export type BookRequest = Tables<'book_requests'>;
export type RequestFulfillment = Tables<'request_fulfillments'>;
export type InventoryLog = Tables<'inventory_log'>;
