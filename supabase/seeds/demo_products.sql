-- Synthetic SoftUni demo only; all unit_price values are EUR.
-- Explicit operator import after approval; not part of the schema migration.
-- Unique fictional SKUs make repeat imports no-ops. Preserve existing rows,
-- including subsequent price/activation edits; never overwrite SKU collisions.
BEGIN;

INSERT INTO public.products (sku, name, description, unit_price, is_active)
VALUES
    ('PDP-DEMO-CREDIT-005', 'Demo Credit 5', 'Fictional prepaid voice credit voucher worth EUR 5.', 5.00, true),
    ('PDP-DEMO-CREDIT-010', 'Demo Credit 10', 'Fictional prepaid voice credit voucher worth EUR 10.', 10.00, true),
    ('PDP-DEMO-CREDIT-020', 'Demo Credit 20', 'Fictional prepaid voice credit voucher worth EUR 20.', 20.00, true),
    ('PDP-DEMO-CREDIT-030', 'Demo Credit 30', 'Fictional prepaid voice credit voucher worth EUR 30.', 30.00, true),
    ('PDP-DEMO-DATA-002', 'Demo Data 2 GB', 'Synthetic 2 GB prepaid data bundle valid for 7 days.', 3.50, true),
    ('PDP-DEMO-DATA-005', 'Demo Data 5 GB', 'Synthetic 5 GB prepaid data bundle valid for 14 days.', 6.75, true),
    ('PDP-DEMO-DATA-010', 'Demo Data 10 GB', 'Synthetic 10 GB prepaid data bundle valid for 30 days.', 10.50, true),
    ('PDP-DEMO-DATA-025', 'Demo Data 25 GB', 'Synthetic 25 GB prepaid data bundle valid for 30 days.', 18.00, true),
    ('PDP-DEMO-VOICE-100', 'Demo Voice 100', 'Synthetic prepaid bundle of 100 voice minutes valid for 30 days.', 4.25, true),
    ('PDP-DEMO-SMS-200', 'Demo Messages 200', 'Synthetic prepaid bundle of 200 SMS messages valid for 30 days.', 2.50, true),
    ('PDP-DEMO-LEGACY-001', 'Demo Legacy Data 1 GB', 'Inactive synthetic 1 GB data bundle retained for archive-access testing.', 2.00, false),
    ('PDP-DEMO-LEGACY-SIM', 'Demo Legacy Starter SIM', 'Inactive fictional prepaid starter SIM retained for archive-access testing.', 12.00, false)
ON CONFLICT (sku) DO NOTHING;

COMMIT;
