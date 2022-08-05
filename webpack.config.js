const package = require('./package.json');
const {ESBuildMinifyPlugin} = require('esbuild-loader');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  entry: {
    index: './src/index.ts',
  },
  output: {
    filename: '[name].js',
    library: {
      type: 'commonjs-module',
    },
    pathinfo: false,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'ts',
          target: 'esnext',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json', '.ts'],
  },
  performance: {
    hints: false,
  },
  devtool: false, // 'inline-source-map',
  target: 'node',
  externals: Object.keys(package.dependencies ?? {}),
  stats: {
    preset: 'errors-only',
    builtAt: true,
    timings: true,
  },
  plugins: [new ForkTsCheckerWebpackPlugin()],
  optimization: {
    // minimize: true,
    minimizer: [
      new ESBuildMinifyPlugin({
        target: 'esnext',
      }),
    ],
  },
};
