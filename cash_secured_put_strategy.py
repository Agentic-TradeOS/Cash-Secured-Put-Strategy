
"""
Cash-Secured Put Strategy
Income strategy: sell an OTM put and hold cash collateral equal to strike × 100.

Pricing: Cox-Ross-Rubinstein (CRR) binomial tree — American-style exercise.
Max Profit: premium collected
Max Loss:   (strike - premium) × 100

Author: Agentic Trading
Version: 1.0.0
"""

import math
from dataclasses import dataclass
from typing import Optional


def crr_price(S: float, K: float, T: float, r: float, sigma: float,
              option_type: str = 'put', steps: int = 100,
              style: str = 'american') -> float:
    if T <= 0 or sigma <= 0:
        return max(S - K, 0.0) if option_type == 'call' else max(K - S, 0.0)
    dt   = T / steps
    u    = math.exp(sigma * math.sqrt(dt))
    d    = 1.0 / u
    disc = math.exp(-r * dt)
    p    = (math.exp(r * dt) - d) / (u - d)
    values = [
        max(S * (u ** j) * (d ** (steps - j)) - K, 0.0) if option_type == 'call'
        else max(K - S * (u ** j) * (d ** (steps - j)), 0.0)
        for j in range(steps + 1)
    ]
    for i in range(steps - 1, -1, -1):
        for j in range(i + 1):
            cont = disc * (p * values[j + 1] + (1 - p) * values[j])
            if style == 'american':
                spot_ij   = S * (u ** j) * (d ** (i - j))
                intrinsic = max(spot_ij - K, 0.0) if option_type == 'call' else max(K - spot_ij, 0.0)
                values[j] = max(intrinsic, cont)
            else:
                values[j] = cont
    return round(values[0], 6)


def assignment_probability_crr(S: float, K: float, T: float, r: float,
                                sigma: float, steps: int = 100) -> float:
    """
    Estimate P(assigned) = P(S_T < K) using the risk-neutral terminal distribution
    implied by the CRR tree.

    We count the fraction of terminal nodes where S_T < K, weighted by their
    risk-neutral probabilities.
    """
    if T <= 0:
        return 1.0 if S < K else 0.0
    dt  = T / steps
    u   = math.exp(sigma * math.sqrt(dt))
    d   = 1.0 / u
    p   = (math.exp(r * dt) - d) / (u - d)
    q   = 1 - p

    # Binomial coefficient: C(n, j) * p^j * q^(n-j)
    prob_below = 0.0
    log_p, log_q = math.log(p), math.log(q)

    # Use log-space for numerical stability
    log_binom = [0.0] * (steps + 1)
    log_binom[0] = steps * log_q
    for j in range(1, steps + 1):
        log_binom[j] = log_binom[j - 1] + math.log(steps - j + 1) - math.log(j) + log_p - log_q

    for j in range(steps + 1):
        spot_t = S * (u ** j) * (d ** (steps - j))
        if spot_t < K:
            prob_below += math.exp(log_binom[j])

    return min(max(prob_below, 0.0), 1.0)


@dataclass
class CspResult:
    premium_collected:      float
    strike_price:           float
    breakeven:              float
    max_profit:             float
    annualized_return:      float
    assignment_probability: float
    capital_required:       float


class CashSecuredPutStrategy:
    """
    Cash-Secured Put Strategy (CRR pricing)

    Sell an OTM put against cash collateral. Collect premium if the stock
    stays above the strike. If assigned, acquire stock at an effective
    discount (strike − premium). Uses CRR for American-style put pricing.

    Parameters
    ----------
    strike_offset      : put strike as % below spot (default -0.05 = 5% OTM)
    days_to_expiry     : days until expiry (default 30)
    risk_free_rate     : annual risk-free rate (default 0.05)
    implied_volatility : IV override
    contracts          : number of contracts (default 1)
    crr_steps          : binomial tree steps (default 100)
    """

    def __init__(
        self,
        strike_offset:      float = -0.05,
        days_to_expiry:     int   = 30,
        risk_free_rate:     float = 0.05,
        implied_volatility: Optional[float] = None,
        contracts:          int   = 1,
        crr_steps:          int   = 100,
    ):
        self.strike_offset      = strike_offset
        self.days_to_expiry     = days_to_expiry
        self.risk_free_rate     = risk_free_rate
        self.implied_volatility = implied_volatility
        self.contracts          = contracts
        self.crr_steps          = crr_steps

    def evaluate(self, spot_price: float, historical_vol: float = 0.25) -> CspResult:
        sigma   = self.implied_volatility or historical_vol
        T       = self.days_to_expiry / 365.0
        r       = self.risk_free_rate
        strike  = round(spot_price * (1 + self.strike_offset), 2)

        premium       = crr_price(spot_price, strike, T, r, sigma, 'put', self.crr_steps)
        total_premium = premium * self.contracts * 100
        capital       = strike * self.contracts * 100
        breakeven     = strike - premium
        ann_return    = (total_premium / capital) * (365 / self.days_to_expiry) * 100
        assign_prob   = assignment_probability_crr(spot_price, strike, T, r, sigma, self.crr_steps)

        return CspResult(
            premium_collected=total_premium,
            strike_price=strike,
            breakeven=breakeven,
            max_profit=total_premium,
            annualized_return=ann_return,
            assignment_probability=assign_prob * 100,
            capital_required=capital,
        )


if __name__ == "__main__":
    strategy = CashSecuredPutStrategy(strike_offset=-0.05, days_to_expiry=30)
    result = strategy.evaluate(spot_price=150.0, historical_vol=0.25)
    print("Cash-Secured Put Analysis (CRR Pricing)")
    print("=" * 45)
    print(f"Strike Price:      ${result.strike_price:.2f}")
    print(f"Premium (CRR):     ${result.premium_collected:.2f}")
    print(f"Breakeven:         ${result.breakeven:.2f}")
    print(f"Capital Required:  ${result.capital_required:.2f}")
    print(f"Annualized Return: {result.annualized_return:.1f}%")
    print(f"Assignment Prob:   {result.assignment_probability:.1f}%")
