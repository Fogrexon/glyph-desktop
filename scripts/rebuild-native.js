const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const ptyDir = path.join(root, 'node_modules', 'node-pty')

function patchSpectre(file) {
  if (!fs.existsSync(file)) return
  const before = fs.readFileSync(file, 'utf8')
  const after = before.replace(/'SpectreMitigation':\s*'Spectre'/g, "'SpectreMitigation': 'false'")
  if (after !== before) {
    fs.writeFileSync(file, after)
    console.log('patched', path.relative(root, file))
  }
}

if (fs.existsSync(ptyDir)) {
  patchSpectre(path.join(ptyDir, 'binding.gyp'))
  patchSpectre(path.join(ptyDir, 'deps', 'winpty', 'src', 'winpty.gyp'))
  fs.writeFileSync(
    path.join(ptyDir, 'Directory.Build.props'),
    `<Project>
  <PropertyGroup>
    <SpectreMitigation>false</SpectreMitigation>
  </PropertyGroup>
</Project>
`
  )
}

const result = spawnSync('npx', ['electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
  shell: true,
  cwd: root
})

process.exit(result.status ?? 1)
