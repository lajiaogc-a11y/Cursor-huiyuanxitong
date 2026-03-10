# Flash Cast Sdn Bhd - Official Website

A professional, modern, and bilingual (Chinese/English) website for Flash Cast Sdn Bhd, a leading interior design company in Malaysia.

## Features

- 🌐 **Bilingual Support**: Full Chinese (zh) and English (en) support with `/zh/` and `/en/` URL structure
- 🎨 **Modern Design**: High-end, professional aesthetic with custom animations
- 📱 **Responsive**: Mobile-first design that works on all devices
- 🚀 **SEO Optimized**: Proper hreflang tags, meta descriptions, and semantic HTML
- 💬 **WhatsApp Integration**: Floating WhatsApp button for instant communication
- 📝 **Contact Forms**: Appointment booking and contact forms with validation
- 🗄️ **Supabase Backend**: Database integration for form submissions and content management

## Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Animations**: Framer Motion
- **Forms**: React Hook Form + Zod validation
- **Database**: Supabase
- **Image Optimization**: Next.js Image component
- **Fonts**: Outfit (sans-serif) + Syne (display)

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── WhatsAppButton.tsx
│   ├── VideoBanner.tsx
│   ├── ServiceCard.tsx
│   ├── CaseCard.tsx
│   └── TestimonialSlider.tsx
├── pages/              # Next.js pages
│   ├── index.tsx       # Home page
│   ├── about.tsx       # About us
│   ├── services.tsx    # Services overview
│   ├── cases.tsx       # Portfolio listing
│   ├── cases/[id].tsx  # Case detail
│   ├── team.tsx        # Team members
│   ├── contact.tsx     # Contact form
│   ├── appointment.tsx # Appointment booking
│   └── privacy.tsx     # Privacy policy
├── lib/
│   ├── translations.ts # Bilingual content
│   └── supabase.ts     # Database client
└── styles/
    └── globals.css     # Global styles
```

## Pages

1. **Home** (`/`) - Video banner, services overview, featured cases, testimonials
2. **Services** (`/services`) - Detailed service offerings
3. **Portfolio** (`/cases`) - Filterable project gallery
4. **Case Detail** (`/cases/[id]`) - Individual project showcase with before/after comparison
5. **About Us** (`/about`) - Company story, mission, vision, values
6. **Team** (`/team`) - Team member profiles
7. **Contact** (`/contact`) - Contact form and information
8. **Appointment** (`/appointment`) - Measurement booking form
9. **Privacy** (`/privacy`) - Privacy policy

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup

Run the SQL schema in your Supabase project:

```bash
# Execute supabase-schema.sql in your Supabase SQL editor
```

This creates the following tables:
- `appointments` - Measurement booking requests
- `contacts` - Contact form submissions
- `cases` - Project portfolio
- `services` - Service offerings
- `team_members` - Team profiles
- `testimonials` - Client reviews

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` (Chinese) or `http://localhost:3000/en` (English)

### 5. Build for Production

```bash
npm run build
npm start
```

## SEO Features

- ✅ Hreflang tags for language versions
- ✅ Unique meta titles and descriptions per page
- ✅ Semantic HTML structure
- ✅ Image alt attributes
- ✅ Clean URL structure
- ✅ Open Graph tags
- ✅ Mobile-friendly design
- ✅ Fast loading with Next.js optimization

## Customization

### Colors

Edit `tailwind.config.ts` to customize the color scheme:

```typescript
colors: {
  primary: { ... },  // Main brand colors
  accent: { ... },   // Accent colors
}
```

### Fonts

Current fonts: Outfit (body) + Syne (headings)

To change, update the Google Fonts import in `src/styles/globals.css`

### Content

All text content is in `src/lib/translations.ts` for easy bilingual management.

### WhatsApp Number

Update the phone number in `src/components/WhatsAppButton.tsx`:

```typescript
phoneNumber = '60123456789'  // Change to your number
```

## Form Handling

Forms automatically save to Supabase. To add email notifications:

1. Set up Supabase Edge Functions or
2. Use a service like SendGrid/Mailgun with API routes

## Deployment

### Vercel (Recommended)

```bash
vercel
```

### Other Platforms

Build the project and deploy the `.next` folder with Node.js support.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Performance

- Lazy loading images
- Code splitting
- Optimized fonts
- Minimal JavaScript bundle
- Server-side rendering

## License

© 2024 Flash Cast Sdn Bhd. All rights reserved.

## Support

For questions or issues, contact: info@flashcast.com
