import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserModel, UserRole } from '../src/models/User';
import { BookModel } from '../src/models/Book';
import bcrypt from 'bcryptjs';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - root .env takes precedence
// Script is in backend/scripts/, so root is 2 levels up
const rootEnvPath = path.resolve(__dirname, '../../.env');
const backendEnvPath = path.resolve(__dirname, '../.env');

console.log('🔍 Looking for .env files:');
console.log(`   Root: ${rootEnvPath}`);
console.log(`   Backend: ${backendEnvPath}`);

// Load backend .env first (if it exists)
const backendResult = dotenv.config({ path: backendEnvPath });
if (!backendResult.error) {
  console.log('✅ Loaded backend/.env');
} else {
  console.log('ℹ️  No backend/.env found (this is okay)');
}

// Then load root .env, which will override backend values
const rootResult = dotenv.config({ path: rootEnvPath, override: true });
if (!rootResult.error) {
  console.log('✅ Loaded root .env');
  if (rootResult.parsed) {
    const keys = Object.keys(rootResult.parsed);
    console.log(`   Loaded ${keys.length} variables: ${keys.join(', ')}`);
  }
} else {
  console.warn(`⚠️  Could not load root .env: ${rootResult.error.message}`);
}

const EMAIL = 'ree@g.com';
const PASSWORD = 'changeme123'; // User should change this
const NAME = 'Admin User';

async function migrateBooksToUser() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGODB_URI 
      || process.env.MONGODB_URL
      || process.env.mongodb_uri
      || process.env.mongodb_url
      || 'mongodb://localhost:27017/ai-kindle';

    if (!process.env.MONGODB_URI && !process.env.MONGODB_URL) {
      console.warn('⚠️  MONGODB_URI not found in environment variables, using default');
      console.warn('   Make sure your .env file contains: MONGODB_URI=your_connection_string');
    } else {
      const foundKey = process.env.MONGODB_URI ? 'MONGODB_URI' : 'MONGODB_URL';
      console.log(`✅ ${foundKey} loaded from environment`);
    }

    console.log(`🔌 Connecting to MongoDB...`);
    console.log(`   URI: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    let user = await UserModel.findOne({ email: EMAIL.toLowerCase() });

    if (user) {
      console.log(`👤 User ${EMAIL} already exists. Updating role to admin...`);
      user.role = UserRole.ADMIN;
      await user.save();
      console.log('✅ User role updated to admin');
    } else {
      console.log(`👤 Creating new user: ${EMAIL}...`);
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(PASSWORD, salt);

      // Create user with admin role
      user = new UserModel({
        email: EMAIL.toLowerCase(),
        password: hashedPassword,
        name: NAME,
        role: UserRole.ADMIN,
        bookCredits: 0
      });

      await user.save();
      console.log('✅ User created with admin role');
    }

    // Count books without userId
    const booksWithoutOwner = await BookModel.countDocuments({ 
      $or: [
        { userId: { $exists: false } },
        { userId: null }
      ]
    });

    // Count all books
    const totalBooks = await BookModel.countDocuments();

    console.log(`\n📚 Found ${totalBooks} total books`);
    console.log(`📚 Found ${booksWithoutOwner} books without owner`);

    if (booksWithoutOwner > 0) {
      console.log(`\n🔄 Assigning ownership of ${booksWithoutOwner} books to ${EMAIL}...`);
      
      const result = await BookModel.updateMany(
        { 
          $or: [
            { userId: { $exists: false } },
            { userId: null }
          ]
        },
        { 
          $set: { userId: user._id }
        }
      );

      console.log(`✅ Updated ${result.modifiedCount} books`);
    }

    // Also assign all books to this user (if user wants to reassign existing books too)
    console.log(`\n🔄 Assigning ALL books to ${EMAIL}...`);
    const allBooksResult = await BookModel.updateMany(
      {},
      { 
        $set: { userId: user._id }
      }
    );

    console.log(`✅ Updated ${allBooksResult.modifiedCount} books total`);

    // Verify
    const booksOwnedByUser = await BookModel.countDocuments({ userId: user._id });
    console.log(`\n✅ Verification: ${booksOwnedByUser} books now owned by ${EMAIL}`);

    console.log('\n✨ Migration complete!');
    console.log(`\n📧 Email: ${EMAIL}`);
    console.log(`🔑 Password: ${PASSWORD}`);
    console.log(`⚠️  Please change the password after first login!`);
    console.log(`👤 Role: ${user.role}`);

  } catch (error: any) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the migration
migrateBooksToUser()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

