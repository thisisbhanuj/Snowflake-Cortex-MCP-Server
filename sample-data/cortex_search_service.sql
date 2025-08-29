USE SCHEMA TPCDS_SF10TCL;

create or replace table PARSE_PDFS as 
    select 
        relative_path, 
        SNOWFLAKE.CORTEX.PARSE_DOCUMENT(@SEMANTIC_DATABASE.TPCDS_SF10TCL.PDF_STAGE, relative_path, {'mode':'LAYOUT'}) as data
    from 
        directory(@SEMANTIC_DATABASE.TPCDS_SF10TCL.PDF_STAGE);

create or replace table PARSED_PDFS as (
    with tmp_parsed as (select
        relative_path,
        SNOWFLAKE.CORTEX.SPLIT_TEXT_RECURSIVE_CHARACTER(TO_VARIANT(data):content, 'MARKDOWN', 1800, 300) AS chunks
    from PARSE_PDFS where TO_VARIANT(data):content is not null)
    select
        TO_VARCHAR(c.value) as PAGE_CONTENT,
        REGEXP_REPLACE(relative_path, '\\.pdf$', '') as TITLE,
        'SEMANTIC_DATABASE.TPCDS_SF10TCL.PDF_STAGE' as INPUT_STAGE,
        RELATIVE_PATH as RELATIVE_PATH
    from tmp_parsed p, lateral FLATTEN(INPUT => p.chunks) c
);

create or replace CORTEX SEARCH SERVICE SEMANTIC_DATABASE.TPCDS_SF10TCL.VEHICLES_INFO
ON PAGE_CONTENT
WAREHOUSE = SNOWFLAKE_LEARNING_WH
TARGET_LAG = '1 hour'
AS (
    SELECT '' AS PAGE_URL, PAGE_CONTENT, TITLE, RELATIVE_PATH
    FROM PARSED_PDFS
);
