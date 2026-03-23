"""
Farm Connect - Database Setup Script
Run this to create the PostgreSQL database and tables
"""

import psycopg2
from psycopg2 import sql, Error
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os
import urllib.parse

def load_env_file():
    """Load .env file from the server directory"""
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, value = line.partition('=')
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

def get_db_params():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL not found in .env")
        return None
    
    # Parse generic postgresql url syntax
    # Expects postgresql+asyncpg://user:password@host:port/dbname
    # Removing +asyncpg for psycopg2 compatibility
    conn_url = database_url.replace("postgresql+asyncpg", "postgresql")
    
    result = urllib.parse.urlparse(conn_url)
    username = result.username
    password = result.password
    database = result.path[1:]
    hostname = result.hostname
    port = result.port
    return {
        'user': username,
        'password': password,
        'host': hostname,
        'port': port,
        'dbname': database
    }

def create_database():
    """Create the farm_connect database if it doesn't exist"""
    params = get_db_params()
    if not params:
        return False

    dbname = params.pop('dbname')
    params['dbname'] = 'postgres' # connect to default db to create new one

    try:
        connection = psycopg2.connect(**params)
        connection.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = connection.cursor()
        
        # Check if database exists
        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (dbname,))
        exists = cursor.fetchone()
        
        if not exists:
            cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
            print(f"[OK] Database '{dbname}' created successfully")
        else:
            print(f"[OK] Database '{dbname}' already exists")
            
        cursor.close()
        connection.close()
        return True
    except Error as e:
        print(f"[ERROR] Error creating database: {e}")
        return False

def run_schema():
    """Execute the schema.sql file to create all tables"""
    params = get_db_params()
    try:
        connection = psycopg2.connect(**params)
        cursor = connection.cursor()
        
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        
        with open(schema_path, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        # In postgres, we can execute the script entirely
        try:
            cursor.execute(sql_script)
            connection.commit()
            print("\n[OK] Schema created successfully!")
        except Error as e:
            print(f"[ERROR] Error executing schema: {e}")
            connection.rollback()
            return False
            
        cursor.close()
        connection.close()
        return True
        
    except Error as e:
        print(f"[ERROR] Database error: {e}")
        return False
    except FileNotFoundError:
        print(f"[ERROR] schema.sql file not found at {schema_path}")
        return False

def seed_admin_user():
    """Create the initial admin user using .env configuration"""
    params = get_db_params()
    
    admin_username = os.environ.get('SEED_ADMIN_USERNAME', 'admin')
    admin_email    = os.environ.get('SEED_ADMIN_EMAIL', '')
    admin_password = os.environ.get('SEED_ADMIN_PASS', 'admin123')
    admin_municipality = os.environ.get('SEED_ADMIN_MUNICIPALITY', 'Mabitac')

    try:
        connection = psycopg2.connect(**params)
        cursor = connection.cursor()
        
        cursor.execute("SELECT id, municipality FROM users WHERE role = 'admin' LIMIT 1")
        existing = cursor.fetchone()

        if existing:
            admin_id, muni = existing
            if not muni:
                cursor.execute(
                    "UPDATE users SET municipality = %s WHERE id = %s",
                    (admin_municipality, admin_id)
                )
                connection.commit()
                print(f"[OK] Admin user already exists (ID: {admin_id})")
                print(f"  [WARN] Municipality was NULL — fixed to '{admin_municipality}'")
            else:
                print(f"[OK] Admin user already exists (ID: {admin_id}, municipality: {muni})")
        else:
            from werkzeug.security import generate_password_hash
            hashed_password = generate_password_hash(admin_password)
            
            insert_query = """
            INSERT INTO users (username, password_hash, full_name, email, role, municipality, contact_no, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(insert_query, (
                admin_username,
                hashed_password,
                'System Administrator',
                admin_email or None,
                'admin',
                admin_municipality,
                '09123456789',
                True
            ))
            
            connection.commit()
            print("[OK] Admin user created successfully")
            print(f"  Username:     {admin_username}")
            print(f"  Email:        {admin_email or '(none)'}")
            print(f"  Municipality: {admin_municipality}")
            print("  [WARN] Please change the default password after first login!")
        
        cursor.close()
        connection.close()
        return True
        
    except Error as e:
        print(f"[ERROR] Error creating admin user: {e}")
        return False

if __name__ == "__main__":
    load_env_file()
    print("=" * 60)
    print("  FARM CONNECT — DATABASE SETUP (PostgreSQL)")
    print("=" * 60)
    
    print("  Step 1: Creating database...")
    if not create_database():
        print("\n  [ERROR] Failed to create database. Exiting.")
        exit(1)
    
    print("\n  Step 2: Creating tables...")
    if not run_schema():
        print("\n  [ERROR] Failed to create tables. Exiting.")
        exit(1)
    
    print("\n  Step 3: Seeding admin user (from .env)...")
    if not seed_admin_user():
        print("\n  [ERROR] Failed to create admin user. Exiting.")
        exit(1)
    
    print("\n" + "=" * 60)
    print("  [OK] DATABASE SETUP COMPLETE!")
    print("=" * 60)
