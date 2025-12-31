import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

console.log('🚀 Starting deployment build...\n');

// Step 1: Build shared package
console.log('📦 Building shared package...');
try {
  execSync('npm run build', { 
    cwd: join(ROOT_DIR, 'shared'),
    stdio: 'inherit'
  });
  console.log('✅ Shared package built successfully\n');
} catch (error) {
  console.error('❌ Failed to build shared package');
  process.exit(1);
}

// Step 2: Build frontend
console.log('🎨 Building frontend...');
try {
  execSync('npm run build', { 
    cwd: join(ROOT_DIR, 'frontend'),
    stdio: 'inherit'
  });
  console.log('✅ Frontend built successfully\n');
} catch (error) {
  console.error('❌ Failed to build frontend');
  process.exit(1);
}

// Step 3: Build backend
console.log('⚙️  Building backend...');
try {
  execSync('npm run build', { 
    cwd: join(ROOT_DIR, 'backend'),
    stdio: 'inherit'
  });
  console.log('✅ Backend built successfully\n');
} catch (error) {
  console.error('❌ Failed to build backend');
  process.exit(1);
}

// Step 4: Copy frontend build to backend/dist/public
console.log('📋 Copying frontend build to backend...');
const frontendDist = join(ROOT_DIR, 'frontend', 'dist');
const backendPublic = join(ROOT_DIR, 'backend', 'dist', 'public');

if (!existsSync(frontendDist)) {
  console.error('❌ Frontend dist directory not found');
  process.exit(1);
}

try {
  // Remove existing public directory if it exists
  if (existsSync(backendPublic)) {
    execSync(`rm -rf "${backendPublic}"`, { cwd: ROOT_DIR });
  }
  
  // Copy frontend dist to backend/dist/public
  cpSync(frontendDist, backendPublic, { recursive: true });
  console.log('✅ Frontend copied to backend/dist/public\n');
} catch (error) {
  console.error('❌ Failed to copy frontend build');
  process.exit(1);
}

// Step 4b: Copy shared package to backend for EB deployment
console.log('📦 Copying shared package to backend...');
const sharedDist = join(ROOT_DIR, 'shared', 'dist');
const sharedPackageJson = join(ROOT_DIR, 'shared', 'package.json');
const backendSharedLocal = join(ROOT_DIR, 'backend', 'shared-local');
const backendPackageJsonPath = join(ROOT_DIR, 'backend', 'package.json');

// Function to restore package.json (declared in outer scope)
let restorePackageJson: (() => void) | null = null;

if (!existsSync(sharedDist)) {
  console.error('❌ Shared dist directory not found');
  process.exit(1);
}

try {
  // Remove existing shared-local directory if it exists
  if (existsSync(backendSharedLocal)) {
    execSync(`rm -rf "${backendSharedLocal}"`, { cwd: ROOT_DIR });
  }
  mkdirSync(backendSharedLocal, { recursive: true });
  
  // Copy shared dist
  cpSync(sharedDist, join(backendSharedLocal, 'dist'), { recursive: true });
  
  // Copy shared package.json
  if (existsSync(sharedPackageJson)) {
    cpSync(sharedPackageJson, join(backendSharedLocal, 'package.json'));
  }
  
  // Temporarily modify backend package.json to use file reference
  const backendPackageJson = JSON.parse(readFileSync(backendPackageJsonPath, 'utf-8'));
  const originalSharedDep = backendPackageJson.dependencies['@ai-kindle/shared'];
  backendPackageJson.dependencies['@ai-kindle/shared'] = 'file:./shared-local';
  writeFileSync(backendPackageJsonPath, JSON.stringify(backendPackageJson, null, 2));
  
  console.log('✅ Shared package copied and backend package.json updated\n');
  
  // Store restore function
  restorePackageJson = () => {
    try {
      const pkg = JSON.parse(readFileSync(backendPackageJsonPath, 'utf-8'));
      pkg.dependencies['@ai-kindle/shared'] = originalSharedDep;
      writeFileSync(backendPackageJsonPath, JSON.stringify(pkg, null, 2));
      console.log('✅ Restored backend package.json to original state');
    } catch (error) {
      console.warn('⚠️  Failed to restore backend package.json:', error);
    }
  };
} catch (error) {
  console.error('❌ Failed to copy shared package');
  process.exit(1);
}

// Step 5: Read .env file and convert to .ebextensions/environment.config
console.log('🔧 Creating Elastic Beanstalk environment configuration...');
const envPath = join(ROOT_DIR, '.env');
const backendEnvPath = join(ROOT_DIR, 'backend', '.env');

// Try to read .env from root first, then backend
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf-8');
  console.log('✅ Found .env in root directory');
} else if (existsSync(backendEnvPath)) {
  envContent = readFileSync(backendEnvPath, 'utf-8');
  console.log('✅ Found .env in backend directory');
} else {
  console.warn('⚠️  No .env file found. Creating empty environment.config');
}

// Parse .env file
const envVars: Record<string, string> = {};
const lines = envContent.split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    continue;
  }
  
  // Parse KEY=VALUE format
  const equalIndex = trimmed.indexOf('=');
  if (equalIndex > 0) {
    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    if (key) {
      envVars[key] = value;
    }
  }
}

// Create .ebextensions directory in backend
const ebextensionsDir = join(ROOT_DIR, 'backend', '.ebextensions');
if (!existsSync(ebextensionsDir)) {
  mkdirSync(ebextensionsDir, { recursive: true });
}

// Create environment.config file
const environmentConfig = {
  option_settings: [
    {
      namespace: 'aws:elasticbeanstalk:application:environment',
      option_name: 'NODE_ENV',
      value: 'production'
    },
    ...Object.entries(envVars).map(([key, value]) => ({
      namespace: 'aws:elasticbeanstalk:application:environment',
      option_name: key,
      value: value
    }))
  ]
};

const configPath = join(ebextensionsDir, 'environment.config');
writeFileSync(configPath, JSON.stringify(environmentConfig, null, 2));
console.log(`✅ Created ${configPath} with ${Object.keys(envVars).length} environment variables\n`);

// Step 6: Create deployment zip file
console.log('📦 Creating deployment zip file...');
const zipPath = join(ROOT_DIR, 'deployment.zip');

// Remove existing zip if it exists
if (existsSync(zipPath)) {
  execSync(`rm "${zipPath}"`, { cwd: ROOT_DIR });
}

const output = createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ Deployment zip created: ${zipPath}`);
  console.log(`   Size: ${sizeMB} MB`);
  
  // Restore original package.json
  if (restorePackageJson) {
    restorePackageJson();
  }
  
  console.log('\n🎉 Deployment package ready!');
  console.log('   Upload deployment.zip to Elastic Beanstalk');
});

archive.on('error', (err: Error) => {
  console.error('❌ Error creating zip file:', err);
  process.exit(1);
});

archive.pipe(output);

// Helper function to recursively add files to archive
function addDirectoryToArchive(dirPath: string, basePath: string, archive: archiver.Archiver) {
  const entries = readdirSync(dirPath);
  
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const relativePath = relative(basePath, fullPath);
    const stat = statSync(fullPath);
    
    // Skip node_modules (EB will run npm install)
    if (relativePath.includes('node_modules')) {
      continue;
    }
    
    // Skip .git
    if (relativePath.includes('.git')) {
      continue;
    }
    
    // Skip source files (keep only dist)
    if (relativePath.startsWith('src/') && !relativePath.startsWith('src/uploads/')) {
      continue;
    }
    
    // Skip TypeScript source files
    if (relativePath.endsWith('.ts') && !relativePath.includes('dist')) {
      continue;
    }
    
    // Skip test files
    if (relativePath.includes('.test.') || relativePath.includes('.spec.')) {
      continue;
    }
    
    if (stat.isDirectory()) {
      addDirectoryToArchive(fullPath, basePath, archive);
    } else {
      archive.file(fullPath, { name: relativePath });
    }
  }
}

// Add backend directory contents to zip
const backendDir = join(ROOT_DIR, 'backend');
addDirectoryToArchive(backendDir, backendDir, archive);

archive.finalize();

