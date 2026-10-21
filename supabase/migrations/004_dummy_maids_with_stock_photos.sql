-- Fictional development/test maid profiles using stock photos from Pexels.
-- Run after 001_maid_match.sql; 002 and the removed 003 are not required.
-- Also upgrades picture URLs if you already ran the former migration 003.
-- Models shown are NOT the fictional profile names, actual maids, or endorsers.
-- Bundled photos: public/maids/sample-*.jpg. Sources: public/maids/SOURCES.md.
-- Rerunnable; only marked sample records get their photo URLs updated.

begin;

alter table public.mm_maids add column if not exists photo_url text;

insert into public.mm_maids (
  id, name, location, rate, currency, skills, languages, days,
  hours, arrangement, experience, bio, available, consent, photo_url
)
values
(
  'd3400000-0000-4000-8000-000000000001',
  'Ayesha K.', 'Dubai', 2200, 'AED',
  array['Cleaning','Cooking','Laundry','Childcare'],
  array['English','Urdu'], array['Mon','Tue','Wed','Thu','Fri'],
  8, 'live-out', 6,
  'Housekeeping, cooking, laundry, and childcare support shaped around busy family routines.',
  true, true, '/maids/sample-ayesha.jpg'
),
(
  'd3400000-0000-4000-8000-000000000002',
  'Maria S.', 'Dubai', 2600, 'AED',
  array['Cleaning','Laundry','Childcare','Pet care'],
  array['English'], array['Mon','Tue','Wed','Thu','Fri','Sat'],
  9, 'live-out', 8,
  'Detail-oriented cleaning, laundry, childcare, and pet care for an organized home.',
  true, true, '/maids/sample-maria.jpg'
),
(
  'd3400000-0000-4000-8000-000000000003',
  'Sana R.', 'Dubai', 2000, 'AED',
  array['Cleaning','Cooking','Laundry'],
  array['English','Urdu'], array['Mon','Wed','Fri','Sat'],
  6, 'live-out', 4,
  'Flexible housekeeping, fresh meal preparation, and laundry support throughout the week.',
  true, true, '/maids/sample-sana.jpg'
),
(
  'd3400000-0000-4000-8000-000000000004',
  'Grace M.', 'Dubai', 3000, 'AED',
  array['Cleaning','Cooking','Elderly assistance'],
  array['English'], array['Mon','Tue','Wed','Thu','Fri'],
  10, 'live-in', 10,
  'Live-in household support, cooking, and assistance with everyday routines.',
  true, true, '/maids/sample-grace.jpg'
),
(
  'd3400000-0000-4000-8000-000000000005',
  'Nadia A.', 'Sharjah', 2100, 'AED',
  array['Cleaning','Laundry','Pet care'],
  array['English','Arabic'], array['Mon','Tue','Wed','Thu','Fri'],
  8, 'live-out', 5,
  'Home organization, careful cleaning, laundry, and pet-friendly household support.',
  true, true, '/maids/sample-nadia.jpg'
),
(
  'd3400000-0000-4000-8000-000000000006',
  'Lea D.', 'Dubai', 2400, 'AED',
  array['Cleaning','Cooking','Childcare'],
  array['English'], array['Mon','Tue','Wed','Thu','Fri'],
  8, 'live-out', 7,
  'Meal planning, cleaning, and childcare support that fits the family schedule.',
  true, true, '/maids/sample-lea.jpg'
)
on conflict (id) do update
set name = excluded.name,
    bio = excluded.bio,
    photo_url = excluded.photo_url
where (public.mm_maids.name = 'Sample - ' || excluded.name
       and public.mm_maids.bio like 'FICTIONAL TEST PROFILE.%')
   or (public.mm_maids.name = excluded.name and public.mm_maids.bio = excluded.bio);

commit;
