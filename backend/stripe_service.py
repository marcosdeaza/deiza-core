"""
Stripe integration for Deiza — one-time payment model.

Plans & their Stripe Price IDs (one-time payments):
  Friend → STRIPE_PRICE_FRIEND  (4.45€ / 30 days)
  Signet → STRIPE_PRICE_SIGNET  (7.75€ / 30 days)

Required env vars:
  STRIPE_SECRET_KEY        → sk_live_...
  STRIPE_PUBLIC_KEY        → pk_live_...
  STRIPE_WEBHOOK_SECRET    → whsec_... (from Stripe dashboard webhook)
  STRIPE_PRICE_FRIEND      → price_...
  STRIPE_PRICE_SIGNET      → price_...
  PLAN_DURATION_DAYS       → 30 (default)
  FRONTEND_URL             → https://deiza.org
"""

import os
import stripe
import stripe.checkout
import logging

logger = logging.getLogger(__name__)

STRIPE_PUBLIC_KEY = os.environ.get('STRIPE_PUBLIC_KEY', '')
PLAN_DURATION_DAYS = int(os.environ.get('PLAN_DURATION_DAYS', '30'))


def _init_stripe():
    """Initialize stripe with API key — called lazily to ensure env vars are loaded."""
    key = os.environ.get('STRIPE_SECRET_KEY', '')
    if not key:
        raise ValueError('STRIPE_SECRET_KEY not set in environment')
    stripe.api_key = key


PRICE_FRIEND = os.environ.get('STRIPE_PRICE_FRIEND', '')
PRICE_SIGNET = os.environ.get('STRIPE_PRICE_SIGNET', '')

PRICE_TO_PLAN = {
    PRICE_FRIEND: 'friend',
    PRICE_SIGNET: 'signet',
}

PLAN_TO_PRICE = {
    'friend': PRICE_FRIEND,
    'signet': PRICE_SIGNET,
}

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://deiza.org')


def create_checkout_session(user_email: str, plan_key: str, user_id: int) -> str:
    """
    Creates a Stripe Checkout session (one-time payment).
    Returns the checkout URL to redirect the user to.
    """
    _init_stripe()
    price_id = PLAN_TO_PRICE.get(plan_key)
    if not price_id:
        raise ValueError(f'No Stripe price configured for plan: {plan_key}')

    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        mode='payment',
        customer_email=user_email,
        line_items=[{'price': price_id, 'quantity': 1}],
        metadata={
            'user_id': str(user_id),
            'plan_key': plan_key,
            'duration_days': str(PLAN_DURATION_DAYS),
        },
        success_url=f'{FRONTEND_URL}/plans?success=1&plan={plan_key}',
        cancel_url=f'{FRONTEND_URL}/plans?cancelled=1',
        allow_promotion_codes=True,
    )
    return session.url


def handle_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Verify and parse a Stripe webhook event.
    Returns the event dict or raises an exception.
    """
    _init_stripe()
    webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
    event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    return event


def get_plan_from_price(price_id: str) -> str:
    """Map a Stripe price ID to a plan key."""
    return PRICE_TO_PLAN.get(price_id, 'free')


def create_gift_checkout_session(buyer_email: str, plan_key: str, buyer_user_id: int) -> str:
    """Create a Stripe checkout for a gift subscription. On success, a gift code is emailed."""
    _init_stripe()
    price_id = PLAN_TO_PRICE.get(plan_key)
    if not price_id:
        raise ValueError(f'No Stripe price configured for plan: {plan_key}')
    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        mode='payment',
        customer_email=buyer_email,
        line_items=[{'price': price_id, 'quantity': 1}],
        metadata={
            'user_id': str(buyer_user_id),
            'plan_key': plan_key,
            'duration_days': str(PLAN_DURATION_DAYS),
            'is_gift': 'true',
        },
        success_url=f'{FRONTEND_URL}/plans?gift_success=1&plan={plan_key}&sid={{CHECKOUT_SESSION_ID}}',
        cancel_url=f'{FRONTEND_URL}/plans?cancelled=1',
    )
    return session.url
