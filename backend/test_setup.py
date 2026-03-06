import sys
print("Python version:", sys.version)

try:
    import fastapi
    print("✅ FastAPI installed:", fastapi.__version__)
except:
    print("❌ FastAPI not installed")

try:
    import sqlalchemy
    print("✅ SQLAlchemy installed:", sqlalchemy.__version__)
except:
    print("❌ SQLAlchemy not installed")

try:
    import psycopg2
    print("✅ PostgreSQL driver installed")
except:
    print("❌ PostgreSQL driver not installed")

print("\n🎉 Setup complete!")
