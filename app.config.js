// app.config.js
// app.json의 name은 "juvismobile4" (네이티브 프로젝트 파일명 기준)으로 유지.
// iOS 표시 이름: ios.infoPlist.CFBundleDisplayName ("모바일 파일럿 로그북")
// Android 표시 이름: withStringsXml 플러그인으로 strings.xml의 app_name을 직접 주입.
const { withStringsXml } = require('@expo/config-plugins');

module.exports = ({ config }) => {
  return withStringsXml(config, (mod) => {
    const strings = mod.modResults.resources.string ?? [];
    const idx = strings.findIndex((s) => s.$?.name === 'app_name');
    if (idx !== -1) {
      strings[idx]._ = '모바일 파일럿 로그북';
    } else {
      strings.push({ $: { name: 'app_name' }, _: '모바일 파일럿 로그북' });
    }
    return mod;
  });
};
