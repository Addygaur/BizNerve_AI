# BizNerve AI - Requirements Document

## Introduction

BizNerve AI is an AI-powered business monitoring system designed for small to medium retailers. The system uses Prophet (Facebook's time-series forecasting model) to predict demand and revenue, helping retailers prevent losses through strategic, actionable insights.

The prototype focuses on three core capabilities: AI-based demand forecasting, mid-month revenue projection, and margin risk monitoring. The system runs daily batch processing with strategic mid-month checks, avoiding alert spam while providing business-aligned recommendations.

**Target Users**: Retailers with 100-10,000 SKUs
**Core Value**: Predictive business assistant that prevents losses before they happen
**AI Model**: Prophet (Facebook) for time-series forecasting only

## Glossary

- **Prophet**: Facebook's time-series forecasting model used for demand and revenue prediction
- **Demand_Forecast**: AI-generated prediction of future sales for each SKU
- **Revenue_Projection**: AI-based forecast of month-end revenue using current data
- **Stock_Out_Risk**: Probability that a product will run out of inventory within 7 days
- **Dead_Stock**: Inventory with no sales in 30+ days
- **Margin_Decline**: Reduction in profit percentage over a specified period
- **Mid_Month_Check**: Strategic revenue assessment run on Day 10 and Day 20
- **Root_Cause_Analysis**: Category and SKU-level breakdown of revenue issues
- **SKU**: Stock Keeping Unit - individual product identifier

## Requirements

### Requirement 1: AI-Powered Demand Forecasting

**User Story:** As a retailer, I want AI to predict future demand for my products, so that I can order the right quantities at the right time.

#### Acceptance Criteria

1. WHEN the system has 60+ days of historical sales data for a SKU, THE System SHALL use Prophet to generate a 30-day demand forecast
2. WHEN generating forecasts, THE System SHALL provide confidence intervals (upper and lower bounds) for each prediction
3. WHEN seasonal patterns exist in historical data, THE Prophet model SHALL automatically detect and incorporate them into forecasts
4. WHEN forecasts are generated, THE System SHALL identify trend direction (INCREASING, STABLE, or DECREASING) for each SKU
5. WHEN new sales data is uploaded, THE System SHALL update forecasts in the next daily batch processing run

### Requirement 2: Smart Reorder Recommendations

**User Story:** As a retailer, I want the system to tell me exactly when and how much to reorder, so that I never run out of high-demand products.

#### Acceptance Criteria

1. WHEN a demand forecast is available, THE System SHALL calculate optimal reorder quantity based on predicted 30-day demand, current stock, and supplier lead time
2. WHEN calculating reorder quantities, THE System SHALL include a 20% safety stock buffer to account for forecast uncertainty
3. WHEN stock levels are projected to run out within 7 days, THE System SHALL flag the SKU as HIGH risk and recommend immediate reorder
4. WHEN stock levels are projected to run out within 14 days, THE System SHALL flag the SKU as MEDIUM risk
5. WHEN generating reorder recommendations, THE System SHALL provide specific order quantities and optimal order dates

### Requirement 3: Dead Stock Identification

**User Story:** As a retailer, I want to identify products that aren't selling, so that I can take action before they become completely unsellable.

#### Acceptance Criteria

1. WHEN a product shows no sales for 30+ consecutive days, THE System SHALL flag it as potential dead stock
2. WHEN flagging dead stock, THE System SHALL use Prophet forecast to distinguish between truly dead inventory and seasonal slow-movers
3. WHEN dead stock is identified, THE System SHALL calculate total inventory value at risk
4. WHEN presenting dead stock alerts, THE System SHALL recommend specific actions (DISCOUNT, PROMOTE, or CLEARANCE)
5. WHEN generating recommendations, THE System SHALL prioritize by inventory value at risk

### Requirement 4: Mid-Month Revenue Projection

**User Story:** As a business owner, I want to know mid-month if I'm on track to hit my revenue target, so that I can take corrective action before month-end.

#### Acceptance Criteria

1. WHEN Day 10 of the month is reached, THE System SHALL use Prophet to forecast total month-end revenue based on first 10 days of data
2. WHEN Day 20 of the month is reached, THE System SHALL generate an updated month-end revenue forecast based on first 20 days of data
3. WHEN generating revenue projections, THE System SHALL compare forecasted revenue against monthly target
4. WHEN generating revenue projections, THE System SHALL compare forecasted revenue against previous month's actual revenue
5. WHEN revenue projection is complete, THE System SHALL calculate the gap percentage between forecast and target

### Requirement 5: Strategic Revenue Risk Alerts

**User Story:** As a business owner, I want to receive alerts only when there's a significant revenue risk, not for every daily fluctuation.

#### Acceptance Criteria

1. WHEN projected month-end revenue is 30% or more below target, THE System SHALL generate a HIGH severity alert
2. WHEN projected month-end revenue is 20-29% below target, THE System SHALL generate a MEDIUM severity alert
3. WHEN projected month-end revenue is less than 20% below target, THE System SHALL NOT generate an alert
4. WHEN a revenue alert is generated, THE System SHALL include category-level breakdown showing which segments are underperforming
5. WHEN a revenue alert is generated, THE System SHALL provide 1-2 specific actionable recommendations

### Requirement 6: Revenue Root Cause Analysis

**User Story:** As a business owner, I want to understand why revenue is at risk, so that I can focus my efforts on the right areas.

#### Acceptance Criteria

1. WHEN a revenue alert is triggered, THE System SHALL identify the top 3 underperforming product categories
2. WHEN analyzing underperformance, THE System SHALL list the top 5 SKUs with the largest revenue drops
3. WHEN presenting root cause analysis, THE System SHALL compare current month performance against last month
4. WHEN showing category breakdown, THE System SHALL display current revenue, expected revenue, and gap percentage for each category
5. WHEN root cause analysis is complete, THE System SHALL use simple aggregation (no complex AI required)

### Requirement 7: Actionable Revenue Recommendations

**User Story:** As a retailer, I want clear action items when revenue is at risk, so that I know exactly what to do.

#### Acceptance Criteria

1. WHEN a revenue alert includes underperforming categories, THE System SHALL recommend promoting top-selling SKUs in those categories
2. WHEN slow-moving inventory contributes to revenue risk, THE System SHALL recommend offering discounts on specific products
3. WHEN margin decline accompanies revenue risk, THE System SHALL recommend reviewing supplier costs
4. WHEN generating recommendations, THE System SHALL provide no more than 2 action items per alert to avoid overwhelming users
5. WHEN presenting recommendations, THE System SHALL include specific SKU names and suggested discount percentages where applicable

### Requirement 8: Margin Risk Monitoring

**User Story:** As a retailer, I want to monitor my profit margins monthly, so that I can maintain profitability even as costs change.

#### Acceptance Criteria

1. WHEN calculating margins, THE System SHALL compute gross margin percentage as ((selling price - cost price) / selling price) * 100
2. WHEN comparing margins, THE System SHALL calculate current month's average margin and compare it against previous month's average margin
3. WHEN current month margin drops by 10% or more compared to previous month, THE System SHALL flag the SKU or category as MEDIUM risk
4. WHEN a margin alert is generated, THE System SHALL identify whether the decline is due to cost increase, price decrease, or both
5. WHEN presenting margin alerts, THE System SHALL list the top 5 SKUs or categories with the largest margin declines

### Requirement 9: Margin Risk Recommendations

**User Story:** As a retailer, I want suggestions on how to protect my margins, so that I can take action quickly.

#### Acceptance Criteria

1. WHEN margin decline is due to cost increase, THE System SHALL recommend "Review supplier pricing"
2. WHEN margin decline is due to price decrease, THE System SHALL recommend "Adjust selling prices"
3. WHEN margin decline is due to excessive discounting, THE System SHALL recommend "Reduce promotional discounts"
4. WHEN generating margin recommendations, THE System SHALL provide specific SKU or category names with current vs previous month margin percentages
5. WHEN presenting recommendations, THE System SHALL prioritize by total financial impact

### Requirement 10: Inventory Velocity Anomaly Detection

**User Story:** As a retailer, I want to know when product sales patterns change unexpectedly, so that I can adjust my inventory planning.

#### Acceptance Criteria

1. WHEN calculating inventory velocity, THE System SHALL compute 30-day rolling mean and standard deviation for each SKU
2. WHEN daily sales deviate significantly, THE System SHALL calculate Z-score as (actual sales - rolling mean) / rolling standard deviation
3. WHEN Z-score exceeds +2 or falls below -2, THE System SHALL flag the SKU as having anomalous velocity
4. WHEN a velocity spike is detected (Z-score > 2), THE System SHALL recommend increasing stock levels
5. WHEN a velocity drop is detected (Z-score < -2), THE System SHALL recommend reviewing inventory levels to avoid excess stock

### Requirement 11: Data Processing and Scheduling

**User Story:** As a system administrator, I want the system to process data efficiently on a predictable schedule, so that insights are always current without overloading the system.

#### Acceptance Criteria

1. WHEN new sales or inventory data is uploaded, THE System SHALL process it in the next scheduled daily batch run
2. WHEN running daily batch processing, THE System SHALL complete analysis for up to 10,000 SKUs within 15 minutes
3. WHEN Day 10 or Day 20 of the month is reached, THE System SHALL automatically run mid-month revenue projection checks
4. WHEN Prophet model training is required, THE System SHALL retrain models weekly using the latest historical data
5. WHEN batch processing is complete, THE System SHALL update the dashboard with new forecasts and alerts

### Requirement 12: Alert Prioritization

**User Story:** As a retailer, I want to see the most important alerts first, so that I can focus on the biggest risks to my business.

#### Acceptance Criteria

1. WHEN multiple alerts are generated, THE System SHALL calculate estimated financial impact for each alert
2. WHEN prioritizing alerts, THE System SHALL rank them by potential loss amount in descending order
3. WHEN displaying alerts on the dashboard, THE System SHALL show the top 5 highest-priority items
4. WHEN presenting alerts, THE System SHALL use color coding (RED for HIGH risk, YELLOW for MEDIUM risk, GREEN for LOW risk)
5. WHEN an alert includes urgency information, THE System SHALL factor days-until-impact into the priority score

### Requirement 13: Dashboard and User Interface

**User Story:** As a retailer, I want a simple dashboard that shows me what actions to take, so that I can make decisions quickly without analyzing complex data.

#### Acceptance Criteria

1. WHEN users access the dashboard, THE System SHALL display the top 5 priority alerts with clear severity indicators
2. WHEN presenting alerts, THE System SHALL show specific SKU names, estimated impact, and recommended actions
3. WHEN displaying demand forecasts, THE System SHALL provide visual charts showing 30-day predictions with confidence intervals
4. WHEN showing revenue projections, THE System SHALL display current trajectory vs target with gap percentage
5. WHEN users click on an alert, THE System SHALL provide drill-down details including root cause analysis and historical trends

### Requirement 14: Data Input and Integration

**User Story:** As a retailer, I want to easily upload my sales and inventory data, so that I can start getting insights quickly.

#### Acceptance Criteria

1. WHEN uploading data, THE System SHALL accept CSV files containing sales transactions, inventory snapshots, and product catalogs
2. WHEN validating uploaded data, THE System SHALL check for required fields (SKU, quantity, price, date) and reject incomplete records
3. WHEN processing uploaded data, THE System SHALL normalize and store it in the database for analysis
4. WHEN data upload is complete, THE System SHALL provide a summary showing number of records processed and any errors encountered
5. WHEN REST API endpoints are available, THE System SHALL accept JSON-formatted data for future integration with POS systems

## AI Model Scope (Prototype)

The prototype uses a single AI model for all forecasting needs:

**Prophet (Facebook's Time-Series Model)**
- Used for 30-day demand forecasting per SKU
- Used for month-end revenue projection
- Automatically handles seasonality, trends, and missing data
- Provides confidence intervals for all predictions
- Requires minimum 60 days of historical data

**Z-Score (Statistical Method)**
- Used only for inventory velocity anomaly detection
- Not used for revenue monitoring or daily alerts
- Simple statistical calculation, not a machine learning model

**No Other AI Models in Prototype**
- No ARIMA, LSTM, or ensemble models
- No price elasticity modeling
- No competitive pricing analysis
- No advanced ML systems

## Processing Schedule (Prototype)

**Daily Batch Processing**
- Runs once per day (midnight)
- Updates demand forecasts for all SKUs
- Recalculates stock-out risks and reorder recommendations
- Identifies dead stock and margin changes
- Processes newly uploaded data

**Mid-Month Revenue Checks**
- Day 10: First revenue projection and alert check
- Day 20: Updated revenue projection and alert check
- No daily revenue monitoring between these checkpoints

**Weekly Model Training**
- Prophet models retrained every 7 days
- Uses latest historical data for improved accuracy
- Runs during off-peak hours

## Advanced Analytics (Future Scope)

The following features are planned for post-prototype development:

### AI Co-Pilot Assistant
- Natural language interface for dashboard queries
- Voice-based interaction
- Conversational insights explanation
- Multi-language support

### Advanced Forecasting
- Ensemble models combining multiple approaches
- External data integration (weather, holidays, economic indicators)
- Customer churn prediction
- Automated hyperparameter tuning

### Supplier Intelligence
- Supplier performance scoring
- Automated price comparison
- Auto-generated purchase orders
- Alternative supplier recommendations

### Multi-Channel Enterprise
- Real-time POS integration
- E-commerce platform connectors
- Cross-channel inventory reconciliation
- Multi-store management
- Role-based access control

### Price Optimization
- AI-based price elasticity modeling
- Margin simulation engine
- Competitive pricing analysis
- Dynamic pricing recommendations

### Real-Time Processing
- Sub-5-minute data processing
- Continuous recalculation of risks
- Streaming data pipelines
- High-frequency monitoring
