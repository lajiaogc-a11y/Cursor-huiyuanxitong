-- Enable realtime for merchant tables so all accounts sync immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_providers;