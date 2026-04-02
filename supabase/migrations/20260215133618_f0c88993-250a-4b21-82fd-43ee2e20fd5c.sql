
-- ============= Invitation Codes Table =============
CREATE TABLE public.invitation_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Only super admin can manage invitation codes
CREATE POLICY "Admin can manage invitation codes"
  ON public.invitation_codes
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view (needed for signup validation via RPC)
-- Actually, signup happens before auth, so we need the RPC function to handle validation

-- ============= Update signup_employee to require invitation code =============
CREATE OR REPLACE FUNCTION public.signup_employee(
  p_username text, 
  p_password text, 
  p_real_name text,
  p_invitation_code text DEFAULT NULL
)
RETURNS TABLE(success boolean, error_code text, employee_id uuid, assigned_role app_role, assigned_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_first BOOLEAN;
  new_role app_role;
  new_status text;
  new_employee_id uuid;
  v_code_record RECORD;
BEGIN
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM employees WHERE username = p_username) THEN
    RETURN QUERY SELECT false, 'USERNAME_EXISTS'::text, NULL::uuid, NULL::app_role, NULL::text;
    RETURN;
  END IF;
  
  -- Check if first user (becomes admin, no invitation code needed)
  SELECT NOT EXISTS (SELECT 1 FROM employees LIMIT 1) INTO is_first;
  
  IF is_first THEN
    new_role := 'admin';
    new_status := 'active';
  ELSE
    -- Non-first user: require invitation code
    IF p_invitation_code IS NULL OR p_invitation_code = '' THEN
      RETURN QUERY SELECT false, 'INVITATION_CODE_REQUIRED'::text, NULL::uuid, NULL::app_role, NULL::text;
      RETURN;
    END IF;
    
    -- Validate invitation code
    SELECT * INTO v_code_record
    FROM invitation_codes
    WHERE code = p_invitation_code
      AND is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'INVALID_INVITATION_CODE'::text, NULL::uuid, NULL::app_role, NULL::text;
      RETURN;
    END IF;
    
    -- Check expiry
    IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at < now() THEN
      RETURN QUERY SELECT false, 'INVITATION_CODE_EXPIRED'::text, NULL::uuid, NULL::app_role, NULL::text;
      RETURN;
    END IF;
    
    -- Check usage limit
    IF v_code_record.used_count >= v_code_record.max_uses THEN
      RETURN QUERY SELECT false, 'INVITATION_CODE_USED'::text, NULL::uuid, NULL::app_role, NULL::text;
      RETURN;
    END IF;
    
    new_role := 'staff';
    new_status := 'pending';
  END IF;
  
  -- Create employee
  INSERT INTO employees (username, real_name, password_hash, role, status, visible)
  VALUES (p_username, p_real_name, p_password, new_role, new_status, true)
  RETURNING id INTO new_employee_id;
  
  -- Increment invitation code usage (if not first user)
  IF NOT is_first AND v_code_record.id IS NOT NULL THEN
    UPDATE invitation_codes
    SET used_count = used_count + 1
    WHERE id = v_code_record.id;
  END IF;
  
  RETURN QUERY SELECT true, NULL::text, new_employee_id, new_role, new_status;
END;
$$;

-- ============= Function to generate invitation code =============
CREATE OR REPLACE FUNCTION public.generate_invitation_code(
  p_max_uses integer DEFAULT 1,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_creator_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  -- Generate a unique 8-character alphanumeric code
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    SELECT EXISTS (SELECT 1 FROM invitation_codes WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  INSERT INTO invitation_codes (code, max_uses, created_by, expires_at)
  VALUES (v_code, p_max_uses, p_creator_id, p_expires_at);
  
  RETURN v_code;
END;
$$;
