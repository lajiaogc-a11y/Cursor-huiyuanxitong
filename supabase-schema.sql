-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  preferred_datetime TIMESTAMP NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  images TEXT[],
  before_images TEXT[],
  after_images TEXT[],
  locale VARCHAR(5) NOT NULL CHECK (locale IN ('zh', 'en')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  icon_image VARCHAR(255),
  description TEXT,
  locale VARCHAR(5) NOT NULL CHECK (locale IN ('zh', 'en')),
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  photo VARCHAR(255),
  bio TEXT,
  locale VARCHAR(5) NOT NULL CHECK (locale IN ('zh', 'en')),
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  photo VARCHAR(255),
  content TEXT NOT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  locale VARCHAR(5) NOT NULL CHECK (locale IN ('zh', 'en')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_created_at ON appointments(created_at DESC);
CREATE INDEX idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX idx_cases_locale ON cases(locale);
CREATE INDEX idx_cases_category ON cases(category);
CREATE INDEX idx_services_locale ON services(locale);
CREATE INDEX idx_team_members_locale ON team_members(locale);
CREATE INDEX idx_testimonials_locale ON testimonials(locale);

-- Enable Row Level Security (RLS)
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to cases" ON cases FOR SELECT USING (true);
CREATE POLICY "Allow public read access to services" ON services FOR SELECT USING (true);
CREATE POLICY "Allow public read access to team_members" ON team_members FOR SELECT USING (true);
CREATE POLICY "Allow public read access to testimonials" ON testimonials FOR SELECT USING (true);

-- Create policies for public insert on forms
CREATE POLICY "Allow public insert to appointments" ON appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert to contacts" ON contacts FOR INSERT WITH CHECK (true);
