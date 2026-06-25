//==================================================
//
//  Copyright 2022 Siemens Digital Industries Software
//
//==================================================

package com.teamcenter.clientx;

import com.teamcenter.schemas.soa._2006_03.exceptions.ConnectionException;
import com.teamcenter.schemas.soa._2006_03.exceptions.InternalServerException;
import com.teamcenter.schemas.soa._2006_03.exceptions.ProtocolException;
import com.teamcenter.soa.client.ExceptionHandler;
import com.teamcenter.soa.exceptions.CanceledOperationException;

/**
 * Automatic version of AppXExceptionHandler for non-interactive environments.
 * Automatically retries connection errors with exponential backoff.
 * Does NOT prompt for user input.
 */
public class AppXExceptionHandlerAuto implements ExceptionHandler
{
    private static final int MAX_RETRIES = 10;
    private static final long INITIAL_BACKOFF_MS = 5000;   // 5 seconds
    private static final long MAX_BACKOFF_MS = 60000;      // 60 seconds
    
    private int retryCount = 0;
    private long lastBackoffMs = INITIAL_BACKOFF_MS;

    @Override
    public void handleException(InternalServerException ise)
    {
        System.out.println("");
        System.out.println("*****");
        System.out.println("Exception caught in com.teamcenter.clientx.AppXExceptionHandlerAuto.handleException(InternalServerException).");

        if (ise instanceof ConnectionException)
        {
            System.out.println("\nConnection error: " + ise.getMessage());
            
            if (retryCount < MAX_RETRIES)
            {
                retryCount++;
                long backoff = Math.min(lastBackoffMs * 2, MAX_BACKOFF_MS);
                lastBackoffMs = backoff;
                System.out.println("Automatically retrying (" + retryCount + "/" + MAX_RETRIES + ") in " + backoff + "ms...");
                
                try
                {
                    Thread.sleep(backoff);
                    // Return to allow retry
                    return;
                }
                catch (InterruptedException e)
                {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry backoff: " + e.getMessage());
                }
            }
            else
            {
                throw new RuntimeException("Max retries (" + MAX_RETRIES + ") exceeded. Connection failed: " + ise.getMessage());
            }
        }
        else if (ise instanceof ProtocolException)
        {
            System.out.println("\nProtocol error (likely programming error): " + ise.getMessage());
            throw new RuntimeException("Protocol error: " + ise.getMessage());
        }
        else
        {
            System.out.println("\nInternal server error: " + ise.getMessage());
            throw new RuntimeException("Internal server error: " + ise.getMessage());
        }
    }

    @Override
    public void handleException(CanceledOperationException coe)
    {
        System.out.println("");
        System.out.println("*****");
        System.out.println("Exception caught in AppXExceptionHandlerAuto.handleException(CanceledOperationException).");
        throw new RuntimeException(coe);
    }

    /**
     * Reset retry counter (call after successful operation)
     */
    public void resetRetryCount()
    {
        retryCount = 0;
        lastBackoffMs = INITIAL_BACKOFF_MS;
    }
}
