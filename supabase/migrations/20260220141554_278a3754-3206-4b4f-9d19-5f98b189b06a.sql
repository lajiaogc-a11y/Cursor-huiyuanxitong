-- Enable realtime for orders table so Merchant Settlement can detect order deletions/updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Enable realtime for activity_gifts table for payment provider gift tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_gifts;