//==================================================
// 
//  Copyright 2022 Siemens Digital Industries Software
//
//==================================================

package com.teamcenter.clientx;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.Vector;


import com.teamcenter.net.tcserverproxy.client.TSPException;
import com.teamcenter.schemas.soa._2006_03.exceptions.InvalidCredentialsException;
import com.teamcenter.schemas.soa._2006_03.exceptions.ServiceException;
import com.teamcenter.services.strong.core.DataManagementService;
import com.teamcenter.services.strong.core.SessionService;
import com.teamcenter.services.strong.core._2006_03.Session.LoginResponse;
import com.teamcenter.soa.client.Connection;
import com.teamcenter.soa.client.ExceptionHandler;
import com.teamcenter.soa.client.TccsEnvInfo;
import com.teamcenter.soa.client.model.ModelObject;
import com.teamcenter.soa.client.model.strong.User;
import com.teamcenter.soa.client.model.strong.WorkspaceObject;
import com.teamcenter.soa.exceptions.CanceledOperationException;
import com.teamcenter.soa.exceptions.NotLoadedException;


public class AppXSession
{
    /**
     * Single instance of the Connection object that is shared throughout
     * the application. This Connection object is needed whenever a Service
     * stub is instantiated.
     */
    private static Connection           connection;

    /**
     * The credentialManager is used both by the Session class and the Teamcenter
     * Services Framework to get user credentials.
     *
     */
    private static AppXCredentialManager credentialManager;


    public AppXSession(String host)
    {
        this( host, "", "", false);
    }
    
    /**
     * Create an instance of the Session with a connection to the specified
     * server.
     *
     * Add implementations of the ExceptionHandler, PartialErrorListener,
     * ChangeListener, and DeleteListeners.
     *
     * @param host      Address of the host to connect to, http://serverName:port/tc or tccs://envName
     * @param ssoURL    SSO Login URL, if empty the application will prompt for credentials
     * @param appID     The Application ID for SSO
     */
    public AppXSession( String host, String ssoURL, String appID)
    {
        this(host, ssoURL, appID, false);
    }

    /**
     * Create an instance of the Session with a connection to the specified
     * server.
     *
     * @param host              Address of the host to connect to, http://serverName:port/tc or tccs://envName
     * @param ssoURL            SSO Login URL, if empty the application will prompt for credentials
     * @param appID             The Application ID for SSO
     * @param autoRetry         If true, use automatic retry handler (no interactive prompts); if false, use interactive handler
     */
    public AppXSession( String host, String ssoURL, String appID, boolean autoRetry)
    {
        // Create an instance of the CredentialManager, this is used
        // by the SOA Framework to get the user's credentials when
        // challenged by the server (session timeout on the web tier).
        credentialManager = new AppXCredentialManager(ssoURL, appID);


        // Create the Connection object, no contact is made with the server until a service request is made
        connection = new Connection(host, credentialManager);




        // Add an ExceptionHandler to the Connection, this will handle any
        // InternalServerException, communication errors, XML marshaling errors
        // .etc
        if (autoRetry) {
            connection.setExceptionHandler(new AppXExceptionHandlerAuto());
        } else {
            connection.setExceptionHandler(new AppXExceptionHandler());
        }

        // While the above ExceptionHandler is required, all of the following
        // Listeners are optional. Client application can add as many or as few Listeners
        // of each type that they want.

        // Add a Partial Error Listener, this will be notified when ever a
        // a service returns partial errors.
        connection.getModelManager().addPartialErrorListener(new AppXPartialErrorListener());

        // Add a Change and Delete Listener, this will be notified when ever a
        // a service returns model objects that have been updated or deleted.
        connection.getModelManager().addModelEventListener(new AppXModelEventListener());


        // Add a Request Listener, this will be notified before and after each
        // service request is sent to the server.
        Connection.addRequestListener( new AppXRequestListener() );

    }

    /**
     * Get the single Connection object for the application
     *
     * @return  connection
     */
    public static Connection getConnection()
    {
        return connection;
    }

    /**
     * Login to the Teamcenter Server
     *
     */
    public User login()
    {
        // Get the service stub
        SessionService sessionService = SessionService.getService(connection);
        String locale = "";
        try
        {
            // Try to get cached credentials first. If none cached, will prompt.
            String[] credentials = credentialManager.getCredentials(new com.teamcenter.schemas.soa._2006_03.exceptions.InvalidUserException("User does not have a session."));
            while (true)
            {
                try
                {

                    // *****************************
                    // Execute the service operation
                    // *****************************
                    LoginResponse out = sessionService.login(credentials[0], credentials[1], credentials[2], credentials[3],locale, credentials[4]);
                    return out.user;
                }
                catch (InvalidCredentialsException e)
                {
                    credentials = credentialManager.getCredentials(e);
                }
            }
        }
        // User canceled the operation, don't need to tell him again
        catch (CanceledOperationException e) {}

        // Exit the application
        System.exit(0);
        return null;
    }

    /**
     * Terminate the session with the Teamcenter Server
     *
     */
    public void logout()
    {
        // Get the service stub
        SessionService sessionService = SessionService.getService(connection);
        try
        {
            // *****************************
            // Execute the service operation
            // *****************************
            sessionService.logout();
        }
        catch (ServiceException e){}
    }

    /**
     * Print some basic information for a list of objects
     *
     * @param objects
     */
    public static void printObjects(ModelObject[] objects)
    {
        if(objects == null)
            return;

        SimpleDateFormat format = new SimpleDateFormat("M/d/yyyy h:mm a", new Locale("en", "US")); // Simple no time zone

        // Ensure that the referenced User objects that we will use below are loaded
        getUsers( objects );

        System.out.println("Name\t\tOwner\t\tLast Modified");
        System.out.println("====\t\t=====\t\t=============");
        for (int i = 0; i < objects.length; i++)
        {
            if(!(objects[i] instanceof WorkspaceObject ))
                continue;

            WorkspaceObject wo = (WorkspaceObject)objects[i];
            try
            {
                String name = wo.get_object_string();
                User owner = (User) wo.get_owning_user();
                Calendar lastModified =wo.get_last_mod_date();

                System.out.println(name + "\t" + owner.get_user_name() + "\t"
                        + format.format(lastModified.getTime()));
            }
            catch (NotLoadedException e)
            {
                // Print out a message, and skip to the next item in the folder
                // Could do a DataManagementService.getProperties call at this point
                System.out.println(e.getMessage());
                System.out.println("The Object Property Policy ($TC_DATA/soa/policies/Default.xml) is not configured with this property.");
            }
        }

    }


    private static void getUsers( ModelObject[] objects )
    {
        if(objects == null)
            return;

        DataManagementService dmService = DataManagementService.getService(AppXSession.getConnection());

        List<User> unKnownUsers = new Vector<User>();
        for (int i = 0; i < objects.length; i++)
        {
            if(!(objects[i] instanceof WorkspaceObject ))
                continue;

            WorkspaceObject wo = (WorkspaceObject)objects[i];

            User owner = null;
            try
            {
                owner = (User) wo.get_owning_user();
                owner.get_user_name();
            }
            catch (NotLoadedException e)
            {
                if(owner != null)
                    unKnownUsers.add(owner);
            }
        }
        User[] users = (User[])unKnownUsers.toArray(new User[unKnownUsers.size()]);
        String[] attributes = { "user_name" };


        // *****************************
        // Execute the service operation
        // *****************************
        dmService.getProperties(users, attributes);


    }

    public static void getConfigurationFromTCCS()
    {
        String serverAddress = System.getProperty("host");
        if(!serverAddress.startsWith("tccs"))
            return;
            
        try 
        {
            TccsEnvInfo env = null;
            if(serverAddress.startsWith("tccs://"))
            {
                env = TccsEnvInfo.getEnvironment(serverAddress.substring(7));
                System.out.println("Using the environment "+env.toString());                    
            }
            else
            {
                System.out.println("Query TCCS for available Teamcenter enviorments to connect to...");
                List<TccsEnvInfo> envs = TccsEnvInfo.getAllEnvironments();
                env = chooseEnvironment( envs );
            }
            System.setProperty("host", env.getTeamcenterPath());
            if(env.isSSOEnabled())
            {
                System.setProperty("sso",        env.getSSOLoginURL());
                System.setProperty("appID",      env.getApplicationID());
            }
        } 
        catch (TSPException e) 
        {
            System.out.println("Failed to get a TCCS environment. "+ e.getMessage());
            System.exit(0);
        }
    }

    private static TccsEnvInfo chooseEnvironment( List<TccsEnvInfo> envs) throws TSPException
    {

        if(envs.size() == 0)
        {
            throw new TSPException("TCCS does not have any configured Teamcenter environments.");
        }
        if(envs.size() == 1)
        {
            TccsEnvInfo env = envs.get(0);
            System.out.println("Using the default environment "+env.toString());
            return env;
        }

        System.out.println("Available Teamcenter environments:");
        System.out.println(TccsEnvInfo.listEnvironments(envs));
        String index = AppXCredentialManager.prompt("Select Teamcenter environment to connect to (1-"+envs.size()+"): ", false);
        int i = Integer.parseInt(index);
        if(i< 1 || i >envs.size())
            System.exit(0);
        TccsEnvInfo env = envs.get(i-1);
        return env;
    }
    
    public static String getOptionalArg( String name, String defaultValue )
    {
        String argValue = defaultValue;
        String arg = System.getProperty(name);
        if (arg != null && arg.length() > 0)
        {
            argValue = arg;
        }
        return argValue;
             
    }

	public void setCredentialManager(AppXCredentialManager credentialManager2) {
		// Update the connection's credential manager with the provided one
		// This allows pre-set credentials (via setUserPassword) to be used for login
		credentialManager = credentialManager2;
		connection.setCredentialManager(credentialManager);
	}
}
