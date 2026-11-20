-- Milestone 3B: initial schema only. Requires Supabase Auth and database roles.
-- Review and obtain approval for the verified target before applying this file.
-- Fail on existing tables rather than silently accepting schema drift.
BEGIN;

CREATE TABLE public.dealers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dealers_name_nonblank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    dealer_id uuid,
    display_name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_auth_user_fk FOREIGN KEY (id)
        REFERENCES auth.users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT profiles_dealer_fk FOREIGN KEY (dealer_id)
        REFERENCES public.dealers (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT profiles_display_name_nonblank
        CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE public.user_roles (
    user_id uuid PRIMARY KEY,
    role text NOT NULL DEFAULT 'dealer',
    CONSTRAINT user_roles_profile_fk FOREIGN KEY (user_id)
        REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT user_roles_role_allowed CHECK (role IN ('dealer', 'admin'))
);

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    unit_price numeric(12, 2) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_sku_unique UNIQUE (sku),
    CONSTRAINT products_sku_nonblank CHECK (length(btrim(sku)) > 0),
    CONSTRAINT products_name_nonblank CHECK (length(btrim(name)) > 0),
    -- The finite upper bound also rejects PostgreSQL numeric NaN.
    CONSTRAINT products_unit_price_valid
        CHECK (unit_price >= 0 AND unit_price < 10000000000)
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id uuid NOT NULL,
    created_by uuid NOT NULL,
    status text NOT NULL DEFAULT 'submitted',
    note text,
    request_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT orders_dealer_fk FOREIGN KEY (dealer_id)
        REFERENCES public.dealers (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT orders_creator_fk FOREIGN KEY (created_by)
        REFERENCES public.profiles (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT orders_status_allowed
        CHECK (status IN ('submitted', 'processing', 'completed', 'rejected')),
    CONSTRAINT orders_note_length CHECK (char_length(note) <= 2000),
    CONSTRAINT orders_creator_request_unique UNIQUE (created_by, request_id)
);

CREATE TABLE public.order_items (
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_snapshot numeric(12, 2) NOT NULL,
    sku_snapshot text NOT NULL,
    name_snapshot text NOT NULL,
    CONSTRAINT order_items_pkey PRIMARY KEY (order_id, product_id),
    CONSTRAINT order_items_order_fk FOREIGN KEY (order_id)
        REFERENCES public.orders (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT order_items_product_fk FOREIGN KEY (product_id)
        REFERENCES public.products (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_valid
        CHECK (unit_price_snapshot >= 0 AND unit_price_snapshot < 10000000000),
    CONSTRAINT order_items_sku_nonblank CHECK (length(btrim(sku_snapshot)) > 0),
    CONSTRAINT order_items_name_nonblank CHECK (length(btrim(name_snapshot)) > 0)
);

CREATE INDEX profiles_dealer_id_idx ON public.profiles (dealer_id);
CREATE INDEX orders_dealer_created_at_idx
    ON public.orders (dealer_id, created_at DESC);
CREATE INDEX order_items_product_id_idx ON public.order_items (product_id);
-- The creator/request UNIQUE index already covers orders.created_by lookups.
-- The order_items primary key already covers order_id lookups.

ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- No policies or client grants in 3B, including for logged-in UI admins.
-- Revoke Supabase default table grants without affecting unrelated tables.
REVOKE ALL PRIVILEGES ON TABLE
    public.dealers,
    public.profiles,
    public.user_roles,
    public.products,
    public.orders,
    public.order_items
FROM PUBLIC, anon, authenticated;

COMMIT;
