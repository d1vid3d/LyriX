module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.lyrix.app',
    executableName: 'LyriX'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupExe: 'LyriX Setup.exe',
        authors: 'LyriX'
      }
    }
  ]
}
