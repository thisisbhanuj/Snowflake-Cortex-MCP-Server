USE ROLE ACCOUNTADMIN;
USE WAREHOUSE SNOWFLAKE_LEARNING_WH;
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';
ALTER ACCOUNT SET CORTEX_MODELS_ALLOWLIST = 'All';
CREATE DATABASE IF NOT EXISTS SEMANTIC_DATABASE;
USE DATABASE SEMANTIC_DATABASE;
CREATE SCHEMA IF NOT EXISTS TPCDS_SF10TCL;
CREATE STAGE SEMANTIC_DATABASE.TPCDS_SF10TCL.SEMANTIC_MODEL_TPCDS;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT USAGE ON DATABASE SEMANTIC_DATABASE TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT USAGE ON SCHEMA SEMANTIC_DATABASE.TPCDS_SF10TCL TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT SELECT ON VIEW SEMANTIC_DATABASE.TPCDS_SF10TCL.TPCDS_SEMANTIC_VIEW_SM TO ROLE SNOWFLAKE_LEARNING_ROLE;

CREATE DATABASE IF NOT EXISTS SNOWFLAKE_INTELLIGENCE;
GRANT USAGE ON DATABASE SNOWFLAKE_INTELLIGENCE TO ROLE SNOWFLAKE_LEARNING_ROLE;
CREATE SCHEMA IF NOT EXISTS SNOWFLAKE_INTELLIGENCE.AGENTS;
GRANT USAGE ON SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT CREATE AGENT ON SCHEMA SNOWFLAKE_INTELLIGENCE.AGENTS TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT USAGE ON SCHEMA SNOWFLAKE_LEARNING_DB.TPCDS_SF10TCL TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT USAGE ON CORTEX SEARCH SERVICE SEMANTIC_DATABASE.TPCDS_SF10TCL.VEHICLES_INFO TO ROLE SNOWFLAKE_LEARNING_ROLE;
GRANT MODIFY PROGRAMMATIC AUTHENTICATION METHODS ON USER BHANUJ TO ROLE SNOWFLAKE_LEARNING_ROLE;
USE SCHEMA TPCDS_SF10TCL;

-- Cortex Semantic View
CREATE OR REPLACE VIEW CUSTOMER AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.CUSTOMER;

CREATE OR REPLACE VIEW CUSTOMER_DEMOGRAPHICS AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.CUSTOMER_DEMOGRAPHICS;

CREATE OR REPLACE VIEW DATE_DIM AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.DATE_DIM;

CREATE OR REPLACE VIEW ITEM AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.ITEM;

CREATE OR REPLACE VIEW STORE AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.STORE;

CREATE OR REPLACE VIEW STORE_SALES AS
SELECT * FROM SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL.STORE_SALES;

-- Create or replace the semantic view named TPCDS_SEMANTIC_VIEW_SM
CREATE OR REPLACE SEMANTIC VIEW TPCDS_SEMANTIC_VIEW_SM
    tables (
        CUSTOMER primary key (C_CUSTOMER_SK)
          WITH SYNONYMS = ('customer', 'customers', 'customer master')
          COMMENT = 'Customer master data including demographics and location',
    
        DATE as DATE_DIM primary key (D_DATE_SK)
          WITH SYNONYMS = ('date', 'calendar date', 'order date', 'sale date')
          COMMENT = 'Calendar date dimension for all sales',
    
        DEMO as CUSTOMER_DEMOGRAPHICS primary key (CD_DEMO_SK)
          WITH SYNONYMS = ('demographics', 'customer demographics')
          COMMENT = 'Customer demographics such as marital status and credit rating',
    
        ITEM primary key (I_ITEM_SK)
          WITH SYNONYMS = ('item', 'product', 'sku', 'catalog item')
          COMMENT = 'Product details including brand, category, and pricing',
    
        STORE primary key (S_STORE_SK)
          WITH SYNONYMS = ('store', 'retail store', 'shop', 'location')
          COMMENT = 'Store information including market, floor space, and state',
    
        STORESALES as STORE_SALES
          primary key (SS_SOLD_DATE_SK, SS_CDEMO_SK, SS_ITEM_SK, SS_STORE_SK, SS_CUSTOMER_SK)
          WITH SYNONYMS = ('store sales', 'sales', 'transactions', 'retail transactions')
          COMMENT = 'Sales fact table capturing items sold by date, store, and customer'
    )
	relationships (
		SALESTOCUSTOMER as STORESALES(SS_CUSTOMER_SK) references CUSTOMER(C_CUSTOMER_SK),
		SALESTODATE as STORESALES(SS_SOLD_DATE_SK) references DATE(D_DATE_SK),
		SALESTODEMO as STORESALES(SS_CDEMO_SK) references DEMO(CD_DEMO_SK),
		SALESTOITEM as STORESALES(SS_ITEM_SK) references ITEM(I_ITEM_SK),
		SALETOSTORE as STORESALES(SS_STORE_SK) references STORE(S_STORE_SK)
	)
	facts (
		ITEM.COST as i_wholesale_cost,
		ITEM.PRICE as i_current_price,
		STORE.TAX_RATE as S_TAX_PRECENTAGE,
        STORESALES.SALES_QUANTITY as SS_QUANTITY
	)
	dimensions (
		CUSTOMER.BIRTHYEAR as C_BIRTH_YEAR,
		CUSTOMER.COUNTRY as C_BIRTH_COUNTRY,
		CUSTOMER.C_CUSTOMER_SK as c_customer_sk,
		DATE.DATE as D_DATE,
		DATE.D_DATE_SK as d_date_sk,
		DATE.MONTH as D_MOY,
		DATE.WEEK as D_WEEK_SEQ,
		DATE.YEAR as D_YEAR,
		DEMO.CD_DEMO_SK as cd_demo_sk,
		DEMO.CREDIT_RATING as CD_CREDIT_RATING,
		DEMO.MARITAL_STATUS as CD_MARITAL_STATUS,
		ITEM.BRAND as I_BRAND,
		ITEM.CATEGORY as I_CATEGORY,
		ITEM.CLASS as I_CLASS,
		ITEM.I_ITEM_SK as i_item_sk,
		STORE.MARKET as S_MARKET_ID,
		STORE.SQUAREFOOTAGE as S_FLOOR_SPACE,
		STORE.STATE as S_STATE,
		STORE.STORECOUNTRY as S_COUNTRY,
		STORE.S_STORE_SK as s_store_sk,
		STORESALES.SS_CDEMO_SK as ss_cdemo_sk,
		STORESALES.SS_CUSTOMER_SK as ss_customer_sk,
		STORESALES.SS_ITEM_SK as ss_item_sk,
		STORESALES.SS_SOLD_DATE_SK as ss_sold_date_sk,
		STORESALES.SS_STORE_SK as ss_store_sk
	)
	metrics (
		STORESALES.TOTALCOST as SUM(item.cost),
		STORESALES.TOTALSALESPRICE as SUM(SS_SALES_PRICE),
		STORESALES.TOTALSALESQUANTITY as SUM(SS_QUANTITY)
            WITH SYNONYMS = ( 'total sales quantity', 'total sales amount')
	)
;

-- Cortex Search
create or replace file format csvformat  
  skip_header = 1  
  field_optionally_enclosed_by = '"'  
  type = 'CSV';  
  
create or replace stage support_tickets_data_stage  
  file_format = csvformat  
  url = 's3://sfquickstarts/sfguide_integrate_snowflake_cortex_agents_with_slack/';  
  
create or replace table SUPPORT_TICKETS (  
  ticket_id VARCHAR(60),  
  customer_name VARCHAR(60),  
  customer_email VARCHAR(60),  
  service_type VARCHAR(60),  
  request VARCHAR,  
  contact_preference VARCHAR(60)  
);  
  
copy into SUPPORT_TICKETS  
  from @support_tickets_data_stage;

-- Run the following statement to create a Snowflake managed internal stage to store the semantic model specification file.
create or replace stage SEMANTIC_MODELS encryption = (TYPE = 'SNOWFLAKE_SSE') directory = ( ENABLE = true );

-- Run the following statement to create a Snowflake managed internal stage to store the PDF documents.
create or replace stage PDF_STAGE encryption = (TYPE = 'SNOWFLAKE_SSE') directory = ( ENABLE = true );
