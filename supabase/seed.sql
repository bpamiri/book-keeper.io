-- ============================================================
-- BookKeeper: Seed Data
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ruhi Book Catalog (20 books total)
-- ------------------------------------------------------------

-- Main Sequence (14 books)
INSERT INTO ruhi_books (title, book_number, category, publication_status, unit, language, description, is_active, sort_order) VALUES
  ('Reflections on the Life of the Spirit', 1, 'main_sequence', 'published', NULL, 'English', 'Understanding the Bahá''í Writings; Prayer; Life and Death', true, 1),
  ('Arising to Serve', 2, 'main_sequence', 'published', NULL, 'English', 'The Joy of Teaching; Uplifting Conversations; Deepening Themes', true, 2),
  ('Teaching Children''s Classes, Grade 1', 3, 'main_sequence', 'published', NULL, 'English', 'Some Principles of Bahá''í Education; Lessons for Children''s Classes, Grade 1', true, 3),
  ('The Twin Manifestations', 4, 'main_sequence', 'published', NULL, 'English', 'The Significance of This Day; The Life of the Báb; The Life of Bahá''u''lláh', true, 4),
  ('Releasing the Powers of Junior Youth', 5, 'main_sequence', 'published', NULL, 'English', 'Animating a junior youth group (3 units)', true, 5),
  ('Teaching the Cause', 6, 'main_sequence', 'published', NULL, 'English', 'The Spiritual Nature of Teaching; Qualities and Attitudes Essential for Teaching; The Act of Teaching', true, 6),
  ('Walking Together on a Path of Service', 7, 'main_sequence', 'published', NULL, 'English', 'Spiritual dynamics; serving as a tutor; promoting the arts at the grassroots', true, 7),
  ('The Covenant of Bahá''u''lláh', 8, 'main_sequence', 'pre_publication', NULL, 'English', 'The Center of the Covenant and His Will and Testament; The Guardian of the Bahá''í Faith; The Administrative Order', true, 8),
  ('Gaining an Historical Perspective', 9, 'main_sequence', 'pre_publication', NULL, 'English', 'The Eternal Covenant; Passage to Maturity; A Sacred Enterprise', true, 9),
  ('Building Vibrant Communities', 10, 'main_sequence', 'pre_publication', NULL, 'English', 'Accompanying One Another on the Path of Service; Consultation; Serving on an Area Teaching Committee', true, 10),
  ('Material Means', 11, 'main_sequence', 'pre_publication', NULL, 'English', 'Giving: The Spiritual Basis of Prosperity; The Institution of the Fund', true, 11),
  ('Family and the Community', 12, 'main_sequence', 'in_development', NULL, 'English', 'The Institution of Marriage', false, 12),
  ('Engaging in Social Action', 13, 'main_sequence', 'in_development', NULL, 'English', 'Stirrings at the Grassroots; Elements of a Conceptual Framework', false, 13),
  ('Participating in Public Discourse', 14, 'main_sequence', 'in_development', NULL, 'English', 'Units forthcoming', false, 14);

-- Branch Courses of Book 3 (4 books)
INSERT INTO ruhi_books (title, book_number, category, publication_status, unit, language, description, is_active, sort_order) VALUES
  ('First Branch Course of Book 3 (Grade 2)', 3, 'branch_book3', 'published', NULL, 'English', 'Teaching Children''s Classes, Grade 2', true, 15),
  ('Second Branch Course of Book 3 (Grade 3)', 3, 'branch_book3', 'published', NULL, 'English', 'Teaching Children''s Classes, Grade 3', true, 16),
  ('Third Branch Course of Book 3 (Grade 4)', 3, 'branch_book3', 'in_development', NULL, 'English', 'Teaching Children''s Classes, Grade 4', false, 17),
  ('Fourth Branch Course of Book 3', 3, 'branch_book3', 'in_development', NULL, 'English', 'Teaching Children''s Classes, advanced branch', false, 18);

-- Branch Courses of Book 5 (2 books)
INSERT INTO ruhi_books (title, book_number, category, publication_status, unit, language, description, is_active, sort_order) VALUES
  ('Initial Impulse', 5, 'branch_book5', 'in_development', NULL, 'English', 'Implementing a Program for the Spiritual Empowerment of Junior Youth', false, 19),
  ('Widening Circle', 5, 'branch_book5', 'in_development', NULL, 'English', 'Implementing a Program for the Spiritual Empowerment of Junior Youth', false, 20);
