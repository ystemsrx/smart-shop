import NextError from 'next/error';

function GlobalError({ statusCode, hasGetInitialPropsRun, err }) {
  if (!hasGetInitialPropsRun && err) {
    throw err;
  }
  return <NextError statusCode={statusCode} />;
}

GlobalError.getInitialProps = async (context) => {
  const errorProps = await NextError.getInitialProps(context);
  if (context.res?.statusCode === 404) {
    return errorProps;
  }
  if (!context.err) {
    return { statusCode: errorProps.statusCode || 404 };
  }
  return errorProps;
};

export default GlobalError;
