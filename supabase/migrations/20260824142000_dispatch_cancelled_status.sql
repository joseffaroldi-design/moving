-- Southern Magnolia Movers — explicit dispatch cancellation state
-- Isolated enum migration so the new value is committed before later use.

alter type public.dispatch_status
  add value if not exists 'cancelled' after 'issue';
