//==================================================
//
//  Copyright 2022 Siemens Digital Industries Software
//
//==================================================

package com.teamcenter.clientx;

import java.io.Console;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.LineNumberReader;

import com.teamcenter.schemas.soa._2006_03.exceptions.InvalidCredentialsException;
import com.teamcenter.schemas.soa._2006_03.exceptions.InvalidUserException;
import com.teamcenter.soa.client.CredentialManager;
import com.teamcenter.soa.client.SsoCredentials;
import com.teamcenter.soa.exceptions.CanceledOperationException;

/**
 * The CredentialManager is used by the Teamcenter Services framework to get the
 * user's credentials when challenged by the server. This can occur after a period
 * of inactivity and the server has timed-out the user's session, at which time
 * the client application will need to re-authenticate. The framework will
 * call one of the getCredentials methods (depending on circumstances) and will
 * send the SessionService.login service request. Upon successful completion of
 * the login service request. The last service request (one that caused the challenge)
 * will be resent.
 *
 * The framework will also call the setUserPassword setGroupRole methods when ever
 * these credentials change, thus allowing this implementation of the CredentialManager
 * to cache these values so prompting of the user is not required for  re-authentication.
 *
 * This implementation supports prompting, at the command line, the user for credentials.
 * Or getting the credentials through TcSS (SSO).
 */
public class AppXCredentialManager implements CredentialManager
{

    private String name          = null;
    private String password      = null;
    private String group         = "";          // default group
    private String role          = "";          // default role
    private String discriminator = "SoaAppX";   // always connect same user to same instance of server
    private SsoCredentials ssoCred = null;
    private int    type            = CredentialManager.CLIENT_CREDENTIAL_TYPE_STD;
    
    /** 
     * Create the CredentialManager with a command line prompt for credentials.
     */
    public AppXCredentialManager()
    {
        this("", "");
    }
    
    /**
     * Create the CredentialManager.
     * If the SSO arguments are provided, the CredentialManager get credentials through TcSS (SSO),
     * otherwise the credentials are obtained by prompting at the command line.
     *
     * @param ssoURL    The SSO Login URL (optional).
     * @param appID     The SSO Application ID (must have a value when ssoURL is set).
     */
    public AppXCredentialManager(String ssoURL, String appID)
    {
        if(ssoURL != null && !ssoURL.isBlank() &&
           appID  != null && !appID.isBlank() )
        {
            ssoCred = new SsoCredentials( ssoURL, appID);
            type    = CredentialManager.CLIENT_CREDENTIAL_TYPE_SSO;
        }
    }  
    
    /**
     * Return the type of credentials this implementation provides,
     * standard (user/password) or Single-Sign-On. In this case
     * Standard credentials are returned.
     *
     * @see com.teamcenter.soa.client.CredentialManager#getCredentialType()
     */
    public int getCredentialType()
    {
        return type;
    }

    /**
     * Prompt's the user for credentials.
     * This method will only be called by the framework when a login attempt has
     * failed.
     *
     * @see com.teamcenter.soa.client.CredentialManager#getCredentials(com.teamcenter.schemas.soa._2006_03.exceptions.InvalidCredentialsException)
     */
    public String[] getCredentials(InvalidCredentialsException e)
    throws CanceledOperationException
    {
        System.out.println(e.getMessage());
        if(type == CredentialManager.CLIENT_CREDENTIAL_TYPE_STD)
        {
            return promptForCredentials();
        }
        // Note: the SsoCredentials will always throw CanceledOperationException
        // If the previous credentials did not work, getting them again from TcSS will not change anything.
        return ssoCred.getCredentials(e);
    }

    /**
     * Return the cached credentials.
     * This method will be called when a service request is sent without a valid
     * session ( session has expired on the server).
     *
     * @see com.teamcenter.soa.client.CredentialManager#getCredentials(com.teamcenter.schemas.soa._2006_03.exceptions.InvalidUserException)
     */
    public String[] getCredentials(InvalidUserException e)
    throws CanceledOperationException
    {
        if(type == CredentialManager.CLIENT_CREDENTIAL_TYPE_STD)
        {
            if (name == null) return promptForCredentials();

        }
        else
        {
            String[] ssoTokens = ssoCred.getCredentials(e);
            name     = ssoTokens[0];
            password = ssoTokens[1];
        }


        String[] tokens = { name, password, group, role, discriminator };
        return tokens;
    }

    /**
     * Cache the group and role
     * This is called after the SessionService.setSessionGroupMember service
     * operation is called.
     *
     * @see com.teamcenter.soa.client.CredentialManager#setGroupRole(java.lang.String,
     *      java.lang.String)
     */
    public void setGroupRole(String group, String role)
    {
        this.group = group;
        this.role = role;
    }

    /**
     * Cache the User and Password
     * This is called after the SessionService.login service operation is called.
     *
     * @see com.teamcenter.soa.client.CredentialManager#setUserPassword(java.lang.String,
     *      java.lang.String, java.lang.String)
     */
    public void setUserPassword(String user, String password, String discriminator)
    {
        this.name = user;
        this.password = password;
        this.discriminator = discriminator;
    }


    public String[] promptForCredentials()
    throws CanceledOperationException
    {
        if(type == CredentialManager.CLIENT_CREDENTIAL_TYPE_SSO)
        {
            return getCredentials( new InvalidUserException("User does not have a session."));
        }


        System.out.println("Please enter user credentials (return to quit):");
        name = prompt("User Name: ", false);
        if (name.length() == 0)
            throw new CanceledOperationException("");

        password = prompt("Password: ", true);


        String[] tokens = { name, password, group, role, discriminator };
        return tokens;
    }
    
    public static String prompt(String question, boolean hideAnswer)
    {
        Console console = System.console();
        if(console != null)
        {
            if(hideAnswer)
            {
                char[] answerChars = System.console().readPassword(question);
                return (answerChars == null)? "": new String(answerChars);
            }
            else
            {
                String line = System.console().readLine(question);
                return (line == null)? "": line;
            }
        }
        else
        {
            LineNumberReader reader = null;
            try
            {
                reader = new LineNumberReader(new InputStreamReader(System.in));
                System.out.print(question);
                String line = reader.readLine();
                return (line == null)? "": line;
            }
            catch (IOException e)
            {        
                String message = "Failed to read the response to '"+question+"'. "+ e.getMessage();
                System.out.println(message);
                System.exit(0);
                return "";
            }
        }
    }

}
