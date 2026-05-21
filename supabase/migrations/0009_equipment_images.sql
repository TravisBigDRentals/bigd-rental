-- Equipment + attachment images.
-- Each machine has a base "image_url" (storage path). Each attachment has its
-- own image_url that's the combined photo (machine + that attachment), so
-- when a customer selects machine + attachment, the right combo image swaps
-- in. Skid steer has dedicated images per attachment; excavator has one
-- shared image for all states (placeholder until client supplies more).

alter table equipment add column if not exists image_url text;
alter table addons add column if not exists image_url text;
