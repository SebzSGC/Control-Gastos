// ==============================================================================
// PaySync - Cross-Platform Native Binding Helper for Vite / Rolldown (Render/Linux)
// Resolves NPM Bug #4828 (optionalDependencies platform strip on cross-OS deploys)
// ==============================================================================

const path = require('path');
const { execSync } = require('child_process');

if (process.platform === 'linux' && process.arch === 'x64') {
  console.log('🐧 Detected Linux x64 environment (Render / Cloud Host).');
  console.log('📦 Ensuring @rolldown/binding-linux-x64-gnu is installed for Vite 8...');
  try {
    const frontendDir = path.join(__dirname, '..', 'frontend');
    execSync('npm install --no-save @rolldown/binding-linux-x64-gnu@1.0.1', {
      cwd: frontendDir,
      stdio: 'inherit'
    });
    console.log('✅ @rolldown/binding-linux-x64-gnu successfully verified.');
  } catch (err) {
    console.warn('⚠️ Notice: Could not install rolldown linux binding:', err.message);
  }
} else {
  console.log(`💻 Host platform (${process.platform}-${process.arch}): skipping Linux-specific native bindings.`);
}
