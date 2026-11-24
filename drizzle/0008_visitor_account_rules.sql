-- Visitor accounts (D-066): rules the ORM cannot express.

-- Emails are stored trimmed and in lower case; names are trimmed and short.
ALTER TABLE "public_users" ADD CONSTRAINT "public_users_email_form"
  CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254 AND position('@' in email) > 1);
--> statement-breakpoint
ALTER TABLE "public_users" ADD CONSTRAINT "public_users_name_form"
  CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 80);
--> statement-breakpoint

-- An email belongs to a staff account or a visitor account, never both: one sign-in form serves both, and it
-- decides by the email. Both tables take the same transaction-level advisory lock on the address before checking
-- the other table, so two concurrent inserts of one address cannot both pass. Raised as 23505 (unique violation).
CREATE FUNCTION account_email_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('account-email:' || lower(btrim(NEW.email)), 0));
  IF TG_TABLE_NAME = 'public_users' THEN
    IF EXISTS (SELECT 1 FROM staff_users WHERE lower(email) = lower(btrim(NEW.email))) THEN
      RAISE EXCEPTION 'This email belongs to a staff account' USING ERRCODE = '23505';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public_users WHERE email = lower(btrim(NEW.email))) THEN
    RAISE EXCEPTION 'This email belongs to a visitor account' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER public_users_email_once BEFORE INSERT OR UPDATE OF email ON "public_users"
  FOR EACH ROW EXECUTE FUNCTION account_email_once();
--> statement-breakpoint
CREATE TRIGGER staff_users_email_once BEFORE INSERT OR UPDATE OF email ON "staff_users"
  FOR EACH ROW EXECUTE FUNCTION account_email_once();
