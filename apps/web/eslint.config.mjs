import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// eslint-config-next's own `next` config object already registers the `jsx-a11y` plugin and
// enables 6 of its rules (alt-text, aria-props, aria-proptypes, aria-unsupported-elements,
// role-has-required-aria-props, role-supports-aria-props), each tuned for Next's own
// conventions (e.g. alt-text is scoped to `img`/`Image` only). Those are left untouched.
// This adds the rest of jsx-a11y's `recommended` preset that Next does not already configure,
// without redeclaring the `jsx-a11y` plugin object (Next's own registration is reused) and
// without overriding any rule Next has already tuned.
const nextConfiguredJsxA11yRules = new Set([
  'jsx-a11y/alt-text',
  'jsx-a11y/aria-props',
  'jsx-a11y/aria-proptypes',
  'jsx-a11y/aria-unsupported-elements',
  'jsx-a11y/role-has-required-aria-props',
  'jsx-a11y/role-supports-aria-props',
]);
const additionalJsxA11yRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).filter(
    ([rule]) => !nextConfiguredJsxA11yRules.has(rule),
  ),
);

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    name: 'jsx-a11y/baseline',
    rules: additionalJsxA11yRules,
  },
];

export default eslintConfig;
