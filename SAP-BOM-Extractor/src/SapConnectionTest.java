import com.sap.conn.jco.JCoDestination;
import com.sap.conn.jco.JCoDestinationManager;
import com.sap.conn.jco.JCoException;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import com.sap.conn.jco.ext.Environment;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

public class SapConnectionTest {

    private static final String DESTINATION_NAME = "S4H_DESTINATION";
    private static final String CONFIG_FILE = "config/sap.properties";

    public static void main(String[] args) {

        System.out.println("Starting SAP JCo connection test...");

        try {
            File configFile = new File(CONFIG_FILE);

            if (!configFile.exists()) {
                throw new IOException(
                    "SAP configuration file not found: "
                    + configFile.getAbsolutePath()
                );
            }

            Properties sapProperties = loadProperties(configFile);

            registerDestinationProvider(sapProperties);

            JCoDestination destination =
                JCoDestinationManager.getDestination(DESTINATION_NAME);

            System.out.println("SAP destination created.");
            System.out.println("Attempting to connect to SAP...");

            destination.ping();

            System.out.println();
            System.out.println("========================================");
            System.out.println("SAP CONNECTION SUCCESSFUL");
            System.out.println("========================================");

            System.out.println(
                "System ID : "
                + destination.getAttributes().getSystemID()
            );

            System.out.println(
                "Client    : "
                + destination.getAttributes().getClient()
            );

            System.out.println(
                "Host      : "
                + destination.getAttributes().getPartnerHost()
            );

            System.out.println(
                "SAP user  : "
                + destination.getAttributes().getUser()
            );

            System.out.println(
                "Language  : "
                + destination.getAttributes().getLanguage()
            );

        } catch (JCoException e) {
            System.err.println();
            System.err.println("SAP JCo connection failed.");
            System.err.println("JCo error group : " + e.getGroup());
            System.err.println("JCo error key   : " + e.getKey());
            System.err.println("Message         : " + e.getMessage());

            e.printStackTrace();

        } catch (UnsatisfiedLinkError e) {
            System.err.println();
            System.err.println("SAP JCo native DLL could not be loaded.");
            System.err.println(
                "Verify that lib/sapjco3.dll exists and is 64-bit."
            );
            System.err.println(
                "Verify that sapjco3.jar and sapjco3.dll came "
                + "from the same SAP JCo package."
            );

            e.printStackTrace();

        } catch (Exception e) {
            System.err.println();
            System.err.println(
                "Application error: " + e.getMessage()
            );

            e.printStackTrace();
        }
    }

    private static Properties loadProperties(File configFile)
        throws IOException {

        Properties properties = new Properties();

        FileInputStream input = null;

        try {
            input = new FileInputStream(configFile);
            properties.load(input);

        } finally {
            if (input != null) {
                input.close();
            }
        }

        validateRequiredProperty(
            properties,
            DestinationDataProvider.JCO_ASHOST
        );

        validateRequiredProperty(
            properties,
            DestinationDataProvider.JCO_SYSNR
        );

        validateRequiredProperty(
            properties,
            DestinationDataProvider.JCO_CLIENT
        );

        validateRequiredProperty(
            properties,
            DestinationDataProvider.JCO_USER
        );

        validateRequiredProperty(
            properties,
            DestinationDataProvider.JCO_PASSWD
        );

        return properties;
    }

    private static void validateRequiredProperty(
        Properties properties,
        String propertyName
    ) {
        String value = properties.getProperty(propertyName);

        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(
                "Missing SAP property: " + propertyName
            );
        }
    }

    private static void registerDestinationProvider(
        Properties properties
    ) {
        if (Environment.isDestinationDataProviderRegistered()) {
            System.out.println(
                "SAP destination provider is already registered."
            );
            return;
        }

        DestinationDataProvider provider =
            new SimpleDestinationDataProvider(properties);

        Environment.registerDestinationDataProvider(provider);

        System.out.println(
            "SAP destination provider registered."
        );
    }

    private static class SimpleDestinationDataProvider
        implements DestinationDataProvider {

        private final Properties properties;

        private SimpleDestinationDataProvider(
            Properties properties
        ) {
            this.properties = properties;
        }

        @Override
        public Properties getDestinationProperties(
            String destinationName
        ) {
            if (DESTINATION_NAME.equals(destinationName)) {
                return properties;
            }

            return null;
        }

        @Override
        public void setDestinationDataEventListener(
            DestinationDataEventListener listener
        ) {
            // Static configuration: events are not needed.
        }

        @Override
        public boolean supportsEvents() {
            return false;
        }
    }
}