-- Add per-kitchen-user allowed menu categories (JSON array of strings)
ALTER TABLE `User`
  ADD COLUMN `kitchenAllowedCategories` JSON NULL;





