# Cash Secured Put (CSP) Strategy Engine
A multi-language implementation of the Cash Secured Put options strategy. This repository provides the logic for calculating collateral requirements, determining optimal entry points based on Greeks, and simulating assignment scenarios.

📌 Strategy Overview
The Cash Secured Put is a neutral-to-bullish strategy where an investor writes (sells) a put option while simultaneously setting aside enough cash to purchase the underlying stock if assigned at the strike price (K).
  • Primary Goal: Generate premium income (yield).
  • Secondary Goal: Acquire high-quality assets at a discount.
  • Maximum Risk: K - \text{Premium Received} (per share).

🛠 Tech Stack
  • Python: Used for quantitative analysis, Black-Scholes calculations, and historical backtesting via pandas and numpy.
  • TypeScript: Used for the execution layer, state management, and real-time frontend visualization.

🚀 Key Features
  • Collateral Management: Automatic calculation of the required cash reserve: \text{Cash Required} = (\text{Strike Price} \times 100) - \text{Premium Received}.
  • Assignment Logic: Handles the transition from a short option position to a long equity position if S \leq K at expiration.
  • Greeks Filtering: Filter for high-probability trades using Delta (typically 0.15 to 0.30) and Theta decay.
  • Virtual Settlement: Support for "paper trading" mode to test the strategy against live market data without financial risk.

💻 Code Examples
TypeScript (Logic Layer)
```typescript
interface PutOption {
  strike: number;
  premium: number;
  contracts: number;
}

/**
 * Calculates the cash required to secure the put position.
 */
const calculateCollateral = (option: PutOption): number => {
  const { strike, premium, contracts } = option;
  return (strike * 100 * contracts) - (premium * 100 * contracts);
};
```
Python (Analytical Layer)
```python
def get_breakeven(strike, premium):
    """
    Returns the price at which the trade neither gains nor loses money.
    """
    return strike - premium

def is_assigned(current_price, strike):
    return current_price <= strike
```
📊 Usage
1.	Configure API Keys: Ensure your brokerage or market data provider keys are in .env.
2.	Run Analysis: Execute the Python scripts to find high-yield CSP opportunities.
3.	Monitor: Use the TypeScript dashboard to track "distance to strike" and "days to expiration" (DTE).
