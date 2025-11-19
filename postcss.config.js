// postcss.config.js
module.exports = {
  plugins: [
    '@tailwindcss/postcss', // Use the separate package name
    'autoprefixer',
    ['cssnano', { preset: ['default', { discardComments: { removeAll: true } }] }]
  ],
}